import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.auth.exceptions import TransportError
import jwt

import auth
import database as db
from routers.auth_routes import router


class GoogleAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_key = cls.key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()
        cls.certs = json.dumps({"test-key": public_key}).encode()
        cls.password_hash = auth.hash_password("existing-password")

    def setUp(self):
        url_patch = patch.object(db, "DATABASE_URL", "")
        url_patch.start()
        self.addCleanup(url_patch.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db_patch = patch.object(db, "DB_PATH", str(Path(self.temp.name) / "test.db"))
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        db.init_db()
        self.env = patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "cadence-test.apps.googleusercontent.com"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.transport = Mock(return_value=SimpleNamespace(status=200, data=self.certs))
        self.request_patch = patch("google_auth.Request", return_value=self.transport)
        self.request_patch.start()
        self.addCleanup(self.request_patch.stop)
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.nonce = "browser-nonce-for-this-attempt"

    def credential(self, **overrides):
        claims = {
            "iss": "https://accounts.google.com",
            "aud": "cadence-test.apps.googleusercontent.com",
            "sub": "google-user-123",
            "email": "member@gmail.com",
            "email_verified": True,
            "name": "Google Member",
            "nonce": self.nonce,
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        }
        claims.update(overrides)
        return jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "test-key"})

    def sign_in(self, credential=None, **body):
        return self.client.post("/auth/google", json={
            "credential": credential or self.credential(), "nonce": self.nonce, **body,
        })

    def test_new_google_account_rejects_pm_role(self):
        response = self.sign_in(role="pm")
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIsNone(db.get_user_by_google_sub("google-user-123"))

    def test_public_signup_cannot_self_assign_pm_role(self):
        response = self.client.post("/auth/signup", json={
            "name": "New Member", "email": "new-member@example.com",
            "password": "new-member-password", "role": "pm",
        })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertIsNone(db.get_user_by_email("new-member@example.com"))

    def test_login_defaults_new_user_to_employee(self):
        self.assertEqual(self.sign_in().json()["role"], "employee")

    def test_returning_user_keeps_role_and_identity_when_email_changes(self):
        first = self.sign_in().json()
        second = self.sign_in(self.credential(email="changed@gmail.com")).json()
        self.assertEqual(second["role"], "employee")
        self.assertEqual(auth.decode_token(first["access_token"])["sub"], auth.decode_token(second["access_token"])["sub"])
        with db.get_conn() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0], 1)

    def test_existing_account_requires_correct_password_and_keeps_role(self):
        user_id = db.create_user("Existing Member", "MEMBER@gmail.com", self.password_hash, "employee")
        for password in (None, "wrong-password"):
            with self.subTest(password=password):
                self.assertEqual(self.sign_in(password=password).status_code, 409)
                self.assertIsNone(db.get_user_by_id(user_id)["google_sub"])
        response = self.sign_in(password="existing-password")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["role"], "employee")
        self.assertEqual(db.get_user_by_id(user_id)["google_sub"], "google-user-123")
        self.assertEqual(self.sign_in().status_code, 200)
        self.assertEqual(self.client.post("/auth/login", json={"email": "MEMBER@gmail.com", "password": "existing-password"}).status_code, 200)

    def test_different_google_identity_cannot_replace_existing_link(self):
        self.sign_in()
        response = self.sign_in(self.credential(sub="different-google-user"))
        self.assertEqual(response.status_code, 403)
        self.assertIsNone(db.get_user_by_google_sub("different-google-user"))

    def test_google_only_account_cannot_use_password_login(self):
        self.sign_in()
        response = self.client.post("/auth/login", json={"email": "member@gmail.com", "password": "anything"})
        self.assertEqual(response.status_code, 401)

    def test_rejects_invalid_claims_without_creating_accounts(self):
        for claims in (
            {"aud": "another-app"}, {"iss": "https://attacker.example"},
            {"exp": int(time.time()) - 60}, {"iat": int(time.time()) + 3600},
            {"email_verified": False}, {"email_verified": "true"},
            {"nonce": "wrong-nonce"}, {"nonce": None}, {"sub": ""}, {"email": None},
        ):
            with self.subTest(claims=claims):
                response = self.sign_in(self.credential(**claims))
                self.assertEqual(response.status_code, 401, response.text)
        self.assertIsNone(db.get_user_by_google_sub("google-user-123"))

    def test_rejects_forged_and_malformed_tokens(self):
        forged = jwt.encode({"sub": "google-user-123"}, "attacker-secret", algorithm="HS256", headers={"kid": "test-key"})
        for token in (forged, "invalid-token"):
            self.assertEqual(self.sign_in(token).status_code, 401)

    def test_rejects_role_and_empty_credential_before_verification(self):
        self.assertEqual(self.sign_in(role="admin").status_code, 422)
        self.assertEqual(self.client.post("/auth/google", json={"credential": "", "nonce": self.nonce}).status_code, 422)
        self.transport.assert_not_called()

    def test_handles_missing_configuration_and_google_outage(self):
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": ""}):
            self.assertEqual(self.client.get("/auth/google/config").json(), {"client_id": ""})
            self.assertEqual(self.sign_in().status_code, 503)
        self.transport.side_effect = TransportError("Network unavailable")
        self.assertEqual(self.sign_in().status_code, 503)

    def test_config_exposes_only_public_client_id(self):
        self.assertEqual(self.client.get("/auth/google/config").json(), {"client_id": "cadence-test.apps.googleusercontent.com"})

    def test_ambiguous_legacy_emails_do_not_link(self):
        db.create_user("One", "member@gmail.com", self.password_hash, "employee")
        db.create_user("Two", "MEMBER@gmail.com", self.password_hash, "pm")
        self.assertEqual(self.sign_in(password="existing-password").status_code, 403)

    def test_new_google_user_has_unique_subject_and_case_insensitive_email(self):
        self.sign_in()
        for email, subject in (("MEMBER@gmail.com", "new-sub"), ("new@gmail.com", "google-user-123")):
            with self.subTest(email=email), self.assertRaises(sqlite3.IntegrityError):
                db.create_google_user("Duplicate", email, subject, "employee")

    def test_legacy_database_migration_preserves_user_and_is_repeatable(self):
        legacy = str(Path(self.temp.name) / "legacy.db")
        with patch.object(db, "DB_PATH", legacy):
            with db.get_conn() as conn:
                conn.execute("""CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                    role TEXT NOT NULL, created_at TEXT NOT NULL)""")
            user_id = db.create_user("Legacy", "old@example.com", self.password_hash, "pm")
            db.init_db()
            db.init_db()
            user = db.get_user_by_id(user_id)
            self.assertEqual(user["password_hash"], self.password_hash)
            self.assertEqual(user["role"], "pm")
            self.assertIsNone(user["google_sub"])


if __name__ == "__main__":
    unittest.main()
