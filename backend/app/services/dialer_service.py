from datetime import datetime, timedelta
from typing import Any, List, Dict

import pymysql
from sqlalchemy.orm import Session

from app.models.call_log import CallLog
from app.models.client import Client
from app.models.settings import Setting


def get_asterisk_connection(client: Client):
    print("Connecting to Asterisk DB...")
    print(f"Host: {client.db_host}, User: {client.db_user}")

    return pymysql.connect(
        host=client.db_host,
        user=client.db_user,
        password=client.db_pass,
        database="asterisk",
        cursorclass=pymysql.cursors.DictCursor,
    )


def _fetch_dialer_payload(client: Client, settings: Setting) -> List[Dict[str, Any]]:
    print(f"Fetching calls for client: {client.id}")

    if not client.campaigns:
        print("No campaigns found")
        return []

    conn = get_asterisk_connection(client)
    cursor = conn.cursor()

    try:
        filters = client.ingroups if client.ingroups else client.campaigns
        campaign_ids = ",".join([f"'{c.strip()}'" for c in filters.split(",") if c.strip()])

        table_name = "vicidial_log" if not client.ingroups else "vicidial_closer_log"
        print(f"Using table: {table_name}")
        print(f"Campaigns: {campaign_ids}")

        connection_uri_underscore = client.dialer_ip.replace(".", "_")

        join_clause = ""

        if table_name == "vicidial_log":
            join_clause = """
                INNER JOIN manual_call_log mcl
                    ON vc.uniqueid = mcl.uniqueid
            """

        sql = f"""
            SELECT
                vc.campaign_id,
                vc.user,
                vc.call_date,
                vc.lead_id,
                r.length_in_sec,
                IFNULL(
                    REPLACE(
                        r.location,
                        'http://{client.dialer_ip}/RECORDINGS/MP3/',
                        CONCAT(
                            'http://192.168.10.3/{connection_uri_underscore}/',
                            DATE_FORMAT(DATE(vc.call_date), '%%Y%%m%%d'),
                            '/'
                        )
                    ),
                    ''
                ) AS file_url
            FROM {table_name} vc
            {join_clause}
            LEFT JOIN recording_log r
                ON vc.lead_id = r.lead_id
               AND DATE(vc.call_date) = DATE(r.start_time)
            WHERE vc.campaign_id IN ({campaign_ids})
              AND vc.call_date > %s
              AND vc.call_date <= DATE_SUB(NOW(), INTERVAL 20 MINUTE)
              AND vc.user != 'VDCL'
            LIMIT 200
        """

        last_sync = datetime.utcnow() - timedelta(hours=1)
        cursor.execute(sql, (last_sync,))
        rows = cursor.fetchall()

        print(f"Rows fetched: {len(rows)}")

        payload: List[Dict[str, Any]] = []

        for row in rows:
            try:
                duration = row["length_in_sec"] or 0

                call_time = row["call_date"]

                call_id = f"{row['campaign_id']}-{row['lead_id']}-{int(call_time.timestamp())}"

                payload.append(
                    {
                        "call_id": call_id,
                        "agent_id": row["user"],
                        "start_time": call_time,
                        "end_time": call_time + timedelta(seconds=duration),
                        "duration": duration,
                        "recording_path": row["file_url"] or "",
                    }
                )

            except Exception as e:
                print(f"Row parse error: {e}")

        return payload

    except Exception as e:
        print(f"SQL ERROR: {e}")
        return []

    finally:
        cursor.close()
        conn.close()
        print("Connection closed")


def fetch_calls_for_client(db: Session, client: Client) -> int:
    print("\n==============================")
    print(f"START FETCH CLIENT {client.id}")
    print("==============================")

    inserted = 0

    settings = db.query(Setting).filter(Setting.client_id == client.id).first()
    if not settings:
        settings = Setting(client_id=client.id)

    now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    today_counts: Dict[str, int] = {}
    total_today = 0

    rows = db.query(CallLog.agent_id).filter(
        CallLog.client_id == client.id,
        CallLog.start_time >= today_start,
    ).all()

    for r in rows:
        today_counts[r.agent_id] = today_counts.get(r.agent_id, 0) + 1
        total_today += 1

    print(f"Today Existing -> Total: {total_today}, Agent: {today_counts}")

    if settings.total and total_today >= settings.total:
        print("DAILY TARGET ALREADY COMPLETED")
        return 0

    data = _fetch_dialer_payload(client, settings)
    print(f"Payload size: {len(data)}")

    from sqlalchemy.dialects.mysql import insert
    seen = set()

    for row in data:
        agent = row["agent_id"]

        agent_today = today_counts.get(agent, 0)

        if settings.audit_calls_per_agent and agent_today >= settings.audit_calls_per_agent:
            continue

        if settings.total and total_today >= settings.total:
            print("DAILY LIMIT REACHED")
            break

        if row["call_id"] in seen:
            continue

        seen.add(row["call_id"])

        try:
            stmt = insert(CallLog).values(client_id=client.id, **row).prefix_with("IGNORE")
            db.execute(stmt)

            today_counts[agent] = agent_today + 1
            total_today += 1
            inserted += 1

            print(f"OK {row['call_id']} | {agent} ({today_counts[agent]})")

        except Exception as e:
            print(f"Insert error: {e}")

    db.commit()

    print("\nFINAL TODAY COUNT:")
    print(today_counts)
    print(f"Total Inserted Today: {total_today}")
    print("==============================\n")

    return inserted