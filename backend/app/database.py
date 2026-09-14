from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.sqlalchemy_database_uri,
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

engine2 = None
SessionLocal2 = None

if settings.sqlalchemy_database_uri2:
    engine2 = create_engine(
        settings.sqlalchemy_database_uri2,
        pool_pre_ping=True,
        pool_recycle=3600,
        future=True,
    )
    SessionLocal2 = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine2
    )

engine3 = None
SessionLocal3 = None

if settings.sqlalchemy_database_uri3:
    engine3 = create_engine(
        settings.sqlalchemy_database_uri3,
        pool_pre_ping=True,
        pool_recycle=3600,
        future=True,
    )
    SessionLocal3 = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine3
    )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db2() -> Generator[Session, None, None]:
    if not SessionLocal2:
        raise RuntimeError("DB2 is not configured")
    db = SessionLocal2()
    try:
        yield db
    finally:
        db.close()


def get_db3() -> Generator[Session, None, None]:
    if not SessionLocal3:
        raise RuntimeError("DB3 is not configured")
    db = SessionLocal3()
    try:
        yield db
    finally:
        db.close()
