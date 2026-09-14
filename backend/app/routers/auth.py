from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from passlib.context import CryptContext
import jwt

from ..database import get_db
from ..core.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    full_name: str = ""
    client_id: int = 0


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


def create_token(user_id: int, email: str, is_admin: bool, client_id):
    payload = {
        "sub": str(user_id),
        "email": email,
        "is_admin": is_admin,
        "client_id": client_id,
        "exp": datetime.utcnow() + timedelta(hours=24),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str):
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(authorization: str = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    return decode_token(token)


def _user_payload(m):
    raw_role = m.get("role") or ("admin" if m["is_superuser"] else "user")
    return {
        "id": m["id"],
        "email": m["email"],
        "full_name": m.get("full_name") or "",
        "role": raw_role,
        "is_admin": bool(m["is_superuser"]),
        "client_id": m["client_id"],
        "client_type": m.get("client_type", "admin") if m.get("client_type") else (
            "admin" if m["is_superuser"] else ("service" if m["client_id"] else "sales")
        ),
    }


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    ident = (req.username or "").strip()
    if not ident:
        raise HTTPException(status_code=401, detail="Email is required")

    row = db.execute(
        text("SELECT id, email, password_hash, full_name, role, is_active, is_superuser, client_id FROM users WHERE email = :e"),
        {"e": ident},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    m = row._mapping
    if not m["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    if not pwd_context.verify(req.password, m["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(m["id"], m["email"], bool(m["is_superuser"]), m["client_id"])
    user = _user_payload(m)

    return {"token": token, "user": user}


@router.get("/me")
def get_me(user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, email, full_name, role, is_active, is_superuser, client_id, created_at FROM users WHERE id = :id"),
        {"id": int(user["sub"])},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    m = row._mapping
    payload = _user_payload(m)
    payload["created_at"] = str(m["created_at"])
    return payload


@router.post("/register")
def register(req: RegisterRequest, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Only admins can register users")

    email = (req.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    exists = db.execute(
        text("SELECT id FROM users WHERE email = :e"),
        {"e": email},
    ).fetchone()
    if exists:
        raise HTTPException(status_code=400, detail="Email already exists")

    hashed = pwd_context.hash(req.password)
    db.execute(
        text("""
            INSERT INTO users (email, password_hash, is_active, is_superuser, client_id, created_at)
            VALUES (:e, :p, 1, 0, :ci, NOW())
        """),
        {"e": email, "p": hashed, "ci": req.client_id or None},
    )
    db.commit()
    return {"message": "User registered successfully"}


@router.post("/change-password")
def change_password(req: ChangePasswordRequest, user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT password_hash FROM users WHERE id = :id"),
        {"id": int(user["sub"])},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    if not pwd_context.verify(req.old_password, row._mapping["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    hashed = pwd_context.hash(req.new_password)
    db.execute(
        text("UPDATE users SET password_hash = :p WHERE id = :id"),
        {"p": hashed, "id": int(user["sub"])},
    )
    db.commit()
    return {"message": "Password changed successfully"}
