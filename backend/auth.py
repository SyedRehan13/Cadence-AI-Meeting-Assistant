"""
Cadence backend — auth helpers
--------------------------------
Password hashing (bcrypt, used directly) and JWT creation/verification.
"""

import os
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def hash_password(password: str) -> str:
    # bcrypt has a 72-byte input limit — truncate defensively, same as
    # passlib would have done internally.
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False  # Google-only accounts do not have a local password.
    return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))


def create_token(user_id: int, role: str) -> str:
    import database as db
    user = db.get_user_by_id(user_id)
    if user is None:
        raise ValueError("Account no longer exists")
    payload = {
        "sub": str(user_id),
        "role": role,
        "ver": user["session_version"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises jwt.PyJWTError on invalid/expired tokens — caught in main.py."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
