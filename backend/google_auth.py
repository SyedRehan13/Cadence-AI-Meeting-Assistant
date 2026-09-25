"""Verify Google credentials before issuing a Cadence session."""

import os
import secrets

from fastapi import HTTPException
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request
from google.oauth2 import id_token


def get_client_id():
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


def verify_credential(credential: str, nonce: str):
    client_id = get_client_id()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not available yet. Please use email and password.")
    try:
        # The library checks Google's signature, audience, issuer and expiry.
        claims = id_token.verify_oauth2_token(credential, Request(), client_id)
    except TransportError:
        raise HTTPException(status_code=503, detail="Could not reach Google. Please try again.") from None
    except (ValueError, GoogleAuthError):
        raise HTTPException(status_code=401, detail="Google sign-in expired or could not be verified. Please try again.") from None

    subject = claims.get("sub")
    email = claims.get("email")
    token_nonce = claims.get("nonce")
    if (
        not isinstance(subject, str) or not subject
        or not isinstance(email, str) or "@" not in email
        or claims.get("email_verified") is not True
        or not isinstance(token_nonce, str)
        or not secrets.compare_digest(token_nonce.encode(), nonce.encode())
    ):
        raise HTTPException(status_code=401, detail="Google sign-in could not be verified. Please try again.")
    return claims
