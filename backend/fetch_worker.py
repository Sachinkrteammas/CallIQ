import argparse
import time

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.client import Client
from app.services.dialer_service import fetch_calls_for_client


def run_once(client_id: int = None, limit: int = None) -> int:
    print("\nSTART FETCH WORKER")

    db = SessionLocal()
    total = 0

    try:
        stmt = select(Client).where(Client.is_active == 1)
        if client_id:
            stmt = stmt.where(Client.id == client_id)
        clients = db.scalars(stmt).all()
        print(f"Total Clients Found: {len(clients)}")

        for client in clients:
            print("\n-----------------------------")
            print(f"Processing Client: {client.id} | {client.name}")
            print("-----------------------------")

            try:
                client_db = SessionLocal()

                inserted = fetch_calls_for_client(client_db, client, limit=limit)
                total += inserted

                client_db.close()

                print(f"Done Client {client.name} | Inserted: {inserted}")

            except Exception as e:
                print(f"Error in client {client.name}: {e}")

        print(f"\nTOTAL INSERTED: {total}")
        print("====================================\n")

        return total

    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Manual fetch worker (no Celery).")
    parser.add_argument("--once", action="store_true", help="Run once and exit.")
    parser.add_argument("--interval", type=int, default=120, help="Loop interval in seconds.")
    parser.add_argument(
        "--client-id",
        type=int,
        default=None,
        help="Only process this client id.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max calls to insert per client per run.",
    )
    args = parser.parse_args()

    if args.once:
        run_once(client_id=args.client_id, limit=args.limit)
        return

    while True:
        try:
            run_once(client_id=args.client_id, limit=args.limit)
        except Exception as exc:
            print(f"[fetch_worker] error: {exc}")
        time.sleep(max(1, args.interval))


if __name__ == "__main__":
    main()