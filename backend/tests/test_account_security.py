from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import jwt

import auth
import database as db
from routers.auth_routes import router


class AccountSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = auth.hash_password("current-password")

    def setUp(self):
        url_patch = patch.object(db, "DATABASE_URL", "")
        url_patch.start()
        self.addCleanup(url_patch.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        db_patch = patch.object(db, "DB_PATH", str(Path(self.temp.name) / "account.db"))
        db_patch.start()
        self.addCleanup(db_patch.stop)
        db.init_db()
        self.employee = db.create_user("Member", "member@example.com", self.password_hash, "employee")
        self.manager = db.create_user("Manager", "manager@example.com", self.password_hash, "pm")
        self.other = db.create_user("Other Member", "other@example.com", self.password_hash, "employee")
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = self.session(self.employee)
        self.proof = {"current_password": "current-password"}

    def session(self, user_id):
        user = db.get_user_by_id(user_id)
        return {"Authorization": f"Bearer {auth.create_token(user_id, user['role'])}"}

    def use_response(self, response):
        self.assertEqual(response.status_code, 200, response.text)
        self.headers = {"Authorization": f"Bearer {response.json()['access_token']}"}

    def google_claims(self, subject="google-user", email="google@gmail.com", **extra):
        return {"sub": subject, "email": email, "email_verified": True, "name": "Google User", "iat": int(time.time()), **extra}

    def test_project_relationships_deduplicate_team_and_reporting_managers(self):
        project_a = db.create_project("Alpha", "", self.manager)
        project_b = db.create_project("Beta", "", self.manager)
        for project in (project_a, project_b):
            db.add_project_member(project, self.employee)
        db.add_project_member(project_a, self.other)
        # A PM in a project is not counted as an employee.
        db.add_project_member(project_a, self.manager)
        profile = self.client.get("/auth/profile", headers=self.session(self.manager)).json()
        self.assertEqual(profile["team_member_count"], 2)
        self.assertEqual([project["name"] for project in profile["project_teams"]], ["Alpha", "Beta"])
        employee_profile = self.client.get("/auth/profile", headers=self.headers).json()
        self.assertEqual(employee_profile["reporting_managers"], [{"id": self.manager, "name": "Manager"}])
        self.assertEqual(len(employee_profile["project_teams"]), 2)
        unrelated = db.create_user("Other Manager", "other-manager@example.com", self.password_hash, "pm")
        self.assertEqual(self.client.get("/auth/profile", headers=self.session(unrelated)).json()["team_member_count"], 0)

    def test_password_change_revokes_old_sessions_and_returns_working_session(self):
        old_headers = self.headers.copy()
        response = self.client.post("/auth/password", headers=self.headers, json={**self.proof, "new_password": "new-strong-password"})
        self.use_response(response)
        self.assertEqual(self.client.get("/auth/me", headers=old_headers).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.post("/auth/login", json={"email": "member@example.com", "password": "current-password"}).status_code, 401)
        self.assertEqual(self.client.post("/auth/login", json={"email": "member@example.com", "password": "new-strong-password"}).status_code, 200)

    def test_password_change_rejects_missing_proof_weak_reused_and_oversized_passwords(self):
        cases = [({"new_password": "new-password"}, 400), ({**self.proof, "new_password": "short"}, 422),
                 ({**self.proof, "new_password": "current-password"}, 400),
                 ({**self.proof, "new_password": "界" * 30}, 400)]
        for body, status in cases:
            with self.subTest(status=status, body=body):
                self.assertEqual(self.client.post("/auth/password", headers=self.headers, json=body).status_code, status)
        self.assertTrue(auth.verify_password("current-password", db.get_user_by_id(self.employee)["password_hash"]))

    def test_sign_out_all_revokes_legacy_and_current_tokens_but_not_other_accounts(self):
        legacy_token = jwt.encode({"sub": str(self.employee), "role": "employee", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, auth.SECRET_KEY, algorithm=auth.ALGORITHM)
        legacy_headers = {"Authorization": f"Bearer {legacy_token}"}
        self.assertEqual(self.client.get("/auth/me", headers=legacy_headers).status_code, 200)
        other_headers = self.session(self.other)
        self.assertEqual(self.client.post("/auth/sessions/revoke", headers=self.headers).status_code, 200)
        for headers in (legacy_headers, self.headers):
            self.assertEqual(self.client.get("/auth/me", headers=headers).status_code, 401)
        self.assertEqual(self.client.get("/auth/me", headers=other_headers).status_code, 200)
        self.assertEqual(self.client.post("/auth/login", json={"email": "member@example.com", "password": "current-password"}).status_code, 200)

    def test_email_change_revokes_other_sessions(self):
        response = self.client.patch("/auth/profile", headers=self.headers, json={"name": "Member", "email": "new@example.com", **self.proof})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).status_code, 401)
        self.use_response(response)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).status_code, 200)

    def test_link_requires_current_identity_and_rejects_other_cadence_accounts(self):
        google_body = {"google_credential": "google-token", "google_nonce": "nonce-for-google-link"}
        with patch("google_auth.verify_credential", return_value=self.google_claims()):
            self.assertEqual(self.client.post("/auth/google/link", headers=self.headers, json=google_body).status_code, 400)
            response = self.client.post("/auth/google/link", headers=self.headers, json={**self.proof, **google_body})
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).status_code, 401)
        self.use_response(response)
        self.assertTrue(response.json()["user"]["google_connected"])
        self.assertEqual(response.json()["user"]["google_email"], "google@gmail.com")
        with patch("google_auth.verify_credential", return_value=self.google_claims()):
            self.assertEqual(self.client.post("/auth/google/link", headers=self.session(self.other), json={**self.proof, **google_body}).status_code, 409)
        with patch("google_auth.verify_credential", return_value=self.google_claims(subject="another-sub", email="manager@example.com")):
            self.assertEqual(self.client.post("/auth/google/link", headers=self.session(self.other), json={**self.proof, **google_body}).status_code, 409)

    def test_unlink_requires_password_and_preserves_email_login(self):
        db.link_google_account(self.employee, "linked-user", "google@gmail.com")
        self.headers = self.session(self.employee)
        self.assertEqual(self.client.post("/auth/google/unlink", headers=self.headers, json={}).status_code, 400)
        response = self.client.post("/auth/google/unlink", headers=self.headers, json=self.proof)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).status_code, 401)
        self.use_response(response)
        self.assertFalse(response.json()["user"]["google_connected"])
        self.assertIsNone(db.get_user_by_google_sub("linked-user"))
        self.assertEqual(self.client.post("/auth/login", json={"email": "member@example.com", "password": "current-password"}).status_code, 200)

    def test_google_only_user_must_set_password_before_unlinking(self):
        user = db.create_google_user("Google User", "google@gmail.com", "google-user", "employee")
        self.headers = self.session(user["id"])
        google_proof = {"credential": "google-token", "nonce": "nonce-for-google-proof"}
        with patch("google_auth.verify_credential", return_value=self.google_claims()):
            self.assertEqual(self.client.post("/auth/google/unlink", headers=self.headers, json=google_proof).status_code, 400)
            response = self.client.post("/auth/password", headers=self.headers, json={**google_proof, "new_password": "first-password"})
        self.use_response(response)
        self.assertTrue(response.json()["user"]["has_password"])
        self.assertEqual(self.client.post("/auth/google/unlink", headers=self.headers, json={"current_password": "first-password"}).status_code, 200)

    def test_google_identity_must_match_and_be_fresh(self):
        user = db.create_google_user("Google User", "google@gmail.com", "google-user", "employee")
        self.headers = self.session(user["id"])
        body = {"credential": "google-token", "nonce": "nonce-for-google-proof", "new_password": "first-password"}
        for claims in (self.google_claims(subject="wrong-account"), self.google_claims(iat=int(time.time()) - 301), self.google_claims(iat=None)):
            with patch("google_auth.verify_credential", return_value=claims):
                self.assertEqual(self.client.post("/auth/password", headers=self.headers, json=body).status_code, 400)
        with patch("google_auth.verify_credential", side_effect=HTTPException(status_code=401, detail="Expired Google credential")):
            self.assertEqual(self.client.post("/auth/password", headers=self.headers, json=body).status_code, 400)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).status_code, 200)

    def test_google_user_can_change_cadence_email_without_changing_google_connection(self):
        user = db.create_google_user("Google User", "google@gmail.com", "google-user", "employee")
        self.headers = self.session(user["id"])
        with patch("google_auth.verify_credential", return_value=self.google_claims()):
            response = self.client.patch("/auth/profile", headers=self.headers, json={"name": "Google User", "email": "work@example.com", "credential": "google-token", "nonce": "nonce-for-google-proof"})
        self.use_response(response)
        self.assertEqual(response.json()["user"]["email"], "work@example.com")
        self.assertEqual(response.json()["user"]["google_email"], "google@gmail.com")

    def test_delete_requires_confirmation_and_identity(self):
        self.assertEqual(self.client.request("DELETE", "/auth/account", headers=self.headers, json={**self.proof, "confirmation": "no"}).status_code, 422)
        self.assertEqual(self.client.request("DELETE", "/auth/account", headers=self.headers, json={"confirmation": "DELETE"}).status_code, 400)
        self.assertIsNotNone(db.get_user_by_id(self.employee))

    def test_delete_removes_access_and_personal_fields_but_preserves_shared_history(self):
        project_id = db.create_project("Shared project", "", self.manager)
        db.add_project_member(project_id, self.employee)
        db.add_project_member(project_id, self.other)
        meeting_id = db.add_meeting("Shared meeting", "Discussion", "Summary", self.employee, project_id)
        item_id = db.add_action_item(meeting_id, "Assigned work", "Member", None, "High", "", self.employee)
        response = self.client.request("DELETE", "/auth/account", headers=self.headers, json={**self.proof, "confirmation": "DELETE"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).status_code, 401)
        self.assertIsNone(db.get_user_by_id(self.employee))
        self.assertIsNone(db.get_user_by_email("member@example.com"))
        self.assertNotIn(self.employee, [user["id"] for user in db.list_employees()])
        self.assertEqual([member["id"] for member in db.get_project_members(project_id)], [self.other])
        self.assertIsNotNone(db.get_meeting(meeting_id))
        self.assertIsNone(db.get_action_item(item_id)["owner_user_id"])
        with db.get_conn() as conn:
            deleted = conn.execute("SELECT * FROM users WHERE id=?", (self.employee,)).fetchone()
            self.assertEqual(deleted["name"], "Deleted account")
            self.assertEqual(deleted["password_hash"], "")
            self.assertIsNone(deleted["google_sub"])
            self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.client.post("/auth/login", json={"email": "member@example.com", "password": "current-password"}).status_code, 401)

    def test_delete_project_manager_preserves_projects_and_removes_reporting_identity(self):
        project_id = db.create_project("Shared project", "", self.manager)
        db.add_project_member(project_id, self.employee)
        response = self.client.request("DELETE", "/auth/account", headers=self.session(self.manager), json={**self.proof, "confirmation": "DELETE"})
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(db.get_project(project_id))
        self.assertEqual(self.client.get("/auth/profile", headers=self.headers).json()["reporting_managers"], [])

    def test_migration_preserves_security_fields_and_remains_repeatable(self):
        db.update_user_profile(self.employee, "Member", "member@example.com", "Designer", "Product", 0)
        db.revoke_user_sessions(self.employee)
        db.init_db()
        db.init_db()
        user = db.get_user_by_id(self.employee)
        self.assertEqual(user["session_version"], 1)
        self.assertEqual(user["job_title"], "Designer")
        self.assertEqual(user["department"], "Product")

    def test_stale_security_write_cannot_overwrite_newer_session_state(self):
        db.revoke_user_sessions(self.employee)
        with self.assertRaises(ValueError):
            db.set_user_password(self.employee, auth.hash_password("not-applied"), 0)
        with self.assertRaises(ValueError):
            db.delete_user_account(self.employee, 0)
        with self.assertRaises(ValueError):
            db.update_user_profile(self.employee, "Not Applied", "new@example.com", "", "", 0)
        self.assertEqual(db.get_user_by_id(self.employee)["name"], "Member")


if __name__ == "__main__":
    unittest.main()
