from fastapi import APIRouter, HTTPException, Depends
import re
import time

import database as db
import auth
import google_auth
from schemas import (SignupRequest, LoginRequest, GoogleAuthRequest, TokenResponse,
                     ProfileUpdateRequest, AccountProof, PasswordChangeRequest,
                     GoogleLinkRequest, DeleteAccountRequest)
from deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse)
def signup(body: SignupRequest):
    if body.role not in ("pm", "employee"):
        raise HTTPException(status_code=400, detail="role must be 'pm' or 'employee'")
    if db.get_user_by_email(body.email):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user_id = db.create_user(body.name, body.email, auth.hash_password(body.password), body.role)
    token = auth.create_token(user_id, body.role)
    return TokenResponse(access_token=token, role=body.role, name=body.name)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    user = db.get_user_by_email(body.email)
    if not user or not auth.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = auth.create_token(user["id"], user["role"])
    return TokenResponse(access_token=token, role=user["role"], name=user["name"])


@router.get("/google/config")
def google_config():
    # An OAuth client ID is public; client secrets are never sent to the browser.
    return {"client_id": google_auth.get_client_id()}


@router.post("/google", response_model=TokenResponse)
def google_login(body: GoogleAuthRequest):
    claims = google_auth.verify_credential(body.credential, body.nonce)
    subject = claims["sub"]
    user = db.get_user_by_google_sub(subject)
    if user is None:
        email = claims["email"].strip().lower()
        matches = db.get_users_by_email_case_insensitive(email)
        if len(matches) > 1:
            raise HTTPException(status_code=403, detail="Please use your email and password to log in to this account.")
        try:
            if matches:
                user = matches[0]
                if user["google_sub"] is not None:
                    raise HTTPException(status_code=403, detail="This account is linked to a different Google account.")
                # Matching email alone is not enough to link an existing account.
                if not body.password or not auth.verify_password(body.password, user["password_hash"]):
                    raise HTTPException(status_code=409, detail="Enter your existing Cadence password to link this Google account.")
                db.link_google_account(user["id"], subject, claims["email"], user["session_version"])
            else:
                name = claims.get("name")
                name = name.strip() if isinstance(name, str) else ""
                user = db.create_google_user(name or email.split("@")[0], email, subject, body.role)
        except db.INTEGRITY_ERRORS:
            raise HTTPException(status_code=503, detail="Your account changed during sign-in. Please try Google sign-in again.") from None
    # Roles come from the database for returning users, never from this request.
    return TokenResponse(
        access_token=auth.create_token(user["id"], user["role"]),
        role=user["role"], name=user["name"],
    )


@router.get("/me")
def me(user=Depends(get_current_user)):
    return {"id": user["id"], "name": user["name"], "role": user["role"]}


def public_profile(user):
    return {
        "id": user["id"], "name": user["name"], "email": user["email"],
        "role": user["role"], "created_at": user["created_at"],
        "google_connected": user["google_sub"] is not None,
        "has_password": bool(user["password_hash"]),
        "google_email": user["google_email"],
        "job_title": user["job_title"], "department": user["department"],
        **db.get_user_team_details(user["id"], user["role"]),
    }


def profile_session(user):
    return {"user": public_profile(user), "access_token": auth.create_token(user["id"], user["role"])}


def verify_google_for_account(credential, nonce):
    try:
        return google_auth.verify_credential(credential, nonce)
    except HTTPException as error:
        if error.status_code == 401:
            raise HTTPException(status_code=400, detail=error.detail) from None
        raise


def verify_account_owner(body: AccountProof, user):
    if body.current_password and auth.verify_password(body.current_password, user["password_hash"]):
        return
    if body.credential and body.nonce and user["google_sub"]:
        claims = verify_google_for_account(body.credential, body.nonce)
        issued_at = claims.get("iat")
        if claims["sub"] == user["google_sub"] and isinstance(issued_at, (int, float)) and time.time() - issued_at <= 300:
            return
    raise HTTPException(status_code=400, detail="Confirm your identity with your current password or a fresh sign-in to your connected Google account.")


@router.get("/profile")
def profile(user=Depends(get_current_user)):
    return public_profile(user)


@router.patch("/profile")
def update_profile(body: ProfileUpdateRequest, user=Depends(get_current_user)):
    name = body.name.strip()
    email = body.email.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please enter your name.")
    email_changed = email != user["email"]
    if email_changed:
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise HTTPException(status_code=400, detail="Please enter a valid email address.")
        verify_account_owner(body, user)
    try:
        updated = db.update_user_profile(user["id"], name, email, body.job_title.strip(), body.department.strip(), user["session_version"])
    except db.INTEGRITY_ERRORS:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    return profile_session(updated)


@router.post("/password")
def change_password(body: PasswordChangeRequest, user=Depends(get_current_user)):
    verify_account_owner(body, user)
    if len(body.new_password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Choose a password of at most 72 UTF-8 bytes.")
    if auth.verify_password(body.new_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Choose a different password from your current one.")
    try:
        db.set_user_password(user["id"], auth.hash_password(body.new_password), user["session_version"])
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    return profile_session(db.get_user_by_id(user["id"]))


@router.post("/google/link")
def link_google(body: GoogleLinkRequest, user=Depends(get_current_user)):
    verify_account_owner(body, user)
    if user["google_sub"]:
        raise HTTPException(status_code=409, detail="A Google account is already connected.")
    claims = verify_google_for_account(body.google_credential, body.google_nonce)
    if any(match["id"] != user["id"] for match in db.get_users_by_email_case_insensitive(claims["email"])):
        raise HTTPException(status_code=409, detail="This Google email belongs to another Cadence account.")
    try:
        db.link_google_account(user["id"], claims["sub"], claims["email"], user["session_version"])
    except db.INTEGRITY_ERRORS:
        raise HTTPException(status_code=409, detail="This Google account is already linked, or your account changed. Refresh and try again.") from None
    return profile_session(db.get_user_by_id(user["id"]))


@router.post("/google/unlink")
def unlink_google(body: AccountProof, user=Depends(get_current_user)):
    verify_account_owner(body, user)
    try:
        db.unlink_google_account(user["id"], user["session_version"])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
    return profile_session(db.get_user_by_id(user["id"]))


@router.post("/sessions/revoke")
def sign_out_all(user=Depends(get_current_user)):
    db.revoke_user_sessions(user["id"])
    return {"message": "Signed out from all devices, including this one."}


@router.delete("/account")
def delete_account(body: DeleteAccountRequest, user=Depends(get_current_user)):
    verify_account_owner(body, user)
    try:
        db.delete_user_account(user["id"], user["session_version"])
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    return {"message": "Your account has been deleted. Shared project and meeting history is retained with an anonymous author."}


# not under /auth conceptually, but small enough to live here rather than
# create a whole separate router just for one endpoint
employees_router = APIRouter(tags=["auth"])


@employees_router.get("/employees")
def employees(user=Depends(get_current_user)):
    return [dict(e) for e in db.list_employees()]
