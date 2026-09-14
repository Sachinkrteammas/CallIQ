import argparse
import time

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.client import Client
from app.services.dialer_service import fetch_calls_for_client


def run_once() -> int:
    print("\nSTART FETCH WORKER")

    db = SessionLocal()
    total = 0

    try:
        clients = db.scalars(
            select(Client).where(Client.is_active == 1)
        ).all()
        print(f"Total Clients Found: {len(clients)}")

        for client in clients:
            print("\n-----------------------------")
            print(f"Processing Client: {client.id} | {client.name}")
            print("-----------------------------")

            try:
                client_db = SessionLocal()

                inserted = fetch_calls_for_client(client_db, client)
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
    args = parser.parse_args()

    if args.once:
        run_once()
        return

    while True:
        try:
            run_once()
        except Exception as exc:
            print(f"[fetch_worker] error: {exc}")
        time.sleep(max(1, args.interval))


if __name__ == "__main__":
    main()