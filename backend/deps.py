"""
Shared dependencies for route handlers — who is the current user, and
role-based access checks. Uses FastAPI's HTTPBearer security scheme so
the /docs page shows a proper "Authorize" button.
"""

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

import database as db
import auth

bearer_scheme = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    token = credentials.credentials
    try:
        payload = auth.decode_token(token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    if payload.get("ver", 0) != user["session_version"]:
        raise HTTPException(status_code=401, detail="Your session has ended. Please sign in again.")
    return user


def require_pm(user=Depends(get_current_user)):
    if user["role"] != "pm":
        raise HTTPException(status_code=403, detail="This action requires a Project Manager account")
    return user
