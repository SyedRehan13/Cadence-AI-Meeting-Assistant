from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import auth
import database as db
from deps import require_pm
from routers.auth_routes import router


class ProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = auth.hash_password("current-password")

    def setUp(self):
        url_patch = patch.object(db, "DATABASE_URL", "")
        url_patch.start()
        self.addCleanup(url_patch.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        db_patch = patch.object(db, "DB_PATH", str(Path(self.temp.name) / "profile.db"))
        db_patch.start()
        self.addCleanup(db_patch.stop)
        db.init_db()
        self.user_id = db.create_user("Member", "member@example.com", self.password_hash, "employee")
        self.other_id = db.create_user("Manager", "manager@example.com", self.password_hash, "pm")
        app = FastAPI()
        app.include_router(router)

        @app.get("/pm-check")
        def pm_check(user=Depends(require_pm)):
            return {"role": user["role"]}

        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.headers = {"Authorization": f"Bearer {auth.create_token(self.user_id, 'employee')}"}

    def update(self, **changes):
        return self.client.patch("/auth/profile", headers=self.headers, json={
            "name": "Member", "email": "member@example.com", **changes,
        })

    def test_profile_requires_login_and_only_returns_public_details(self):
        self.assertIn(self.client.get("/auth/profile").status_code, (401, 403))
        response = self.client.get("/auth/profile", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()), {"id", "name", "email", "role", "created_at", "google_connected", "has_password", "google_email", "job_title", "department", "project_teams", "team_member_count", "reporting_managers"})
        self.assertEqual(response.json()["email"], "member@example.com")
        self.assertTrue(response.json()["has_password"])
        self.assertFalse(response.json()["google_connected"])

    def test_unauthenticated_updates_do_not_modify_account(self):
        response = self.client.patch("/auth/profile", json={"name": "Changed", "email": "member@example.com", "role": "pm"})
        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(db.get_user_by_id(self.user_id)["name"], "Member")

    def test_name_job_title_and_department_persist_without_changing_role(self):
        project_id = db.create_project("Existing work", "", self.other_id)
        db.add_project_member(project_id, self.user_id)
        response = self.update(name="  Updated Member  ", job_title="  Designer  ", department="  Product  ")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user"]["name"], "Updated Member")
        self.assertEqual(auth.decode_token(response.json()["access_token"])["role"], "employee")
        self.assertEqual(response.json()["user"]["job_title"], "Designer")
        self.assertEqual(response.json()["user"]["department"], "Product")
        self.assertEqual(self.client.get("/auth/me", headers=self.headers).json()["role"], "employee")
        self.assertEqual(self.client.get("/pm-check", headers=self.headers).status_code, 403)
        self.assertTrue(db.is_project_member(project_id, self.user_id))

    def test_role_is_read_only_in_profile_api(self):
        self.assertEqual(self.update(role="pm").status_code, 422)
        self.assertEqual(db.get_user_by_id(self.user_id)["role"], "employee")

    def test_email_change_requires_current_password(self):
        for password in (None, "incorrect"):
            with self.subTest(password=password):
                response = self.update(email="updated@example.com", current_password=password)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(db.get_user_by_id(self.user_id)["email"], "member@example.com")
        self.assertEqual(self.update(email="updated@example.com", current_password="current-password").status_code, 200)
        self.assertEqual(self.client.post("/auth/login", json={"email": "updated@example.com", "password": "current-password"}).status_code, 200)
        self.assertEqual(self.client.post("/auth/login", json={"email": "member@example.com", "password": "current-password"}).status_code, 401)

    def test_duplicate_email_is_rejected_without_partial_changes(self):
        response = self.update(name="Should not save", email="MANAGER@example.com", current_password="current-password")
        self.assertEqual(response.status_code, 409)
        user = db.get_user_by_id(self.user_id)
        self.assertEqual(user["name"], "Member")
        self.assertEqual(user["role"], "employee")
        self.assertEqual(user["email"], "member@example.com")

    def test_invalid_values_are_rejected(self):
        for changes, status in (({"name": "  "}, 400), ({"name": ""}, 422), ({"name": "x" * 101}, 422), ({"role": "admin"}, 422), ({"email": "invalid", "current_password": "current-password"}, 400)):
            with self.subTest(changes=changes):
                self.assertEqual(self.update(**changes).status_code, status)
        self.assertEqual(db.get_user_by_id(self.user_id)["name"], "Member")

    def test_update_cannot_target_someone_else(self):
        response = self.update(id=self.other_id, user_id=self.other_id, name="My new name")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(db.get_user_by_id(self.other_id)["name"], "Manager")
        self.assertEqual(db.get_user_by_id(self.user_id)["name"], "Member")

    def test_google_account_can_edit_profile_but_email_requires_confirmation(self):
        google_user = db.create_google_user("Google Member", "google@gmail.com", "google-profile-test", "employee")
        self.headers = {"Authorization": f"Bearer {auth.create_token(google_user['id'], 'employee')}"}
        response = self.update(name="Google Updated", job_title="Designer", email="google@gmail.com")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["user"]["google_connected"])
        self.assertFalse(response.json()["user"]["has_password"])
        self.assertEqual(db.get_user_by_google_sub("google-profile-test")["name"], "Google Updated")
        self.assertEqual(self.update(email="new@gmail.com").status_code, 400)

    def test_linked_password_account_can_edit_email_after_confirmation(self):
        db.link_google_account(self.user_id, "linked-google-test")
        self.assertEqual(self.update(name="Updated Linked Member").status_code, 401)
        self.headers = {"Authorization": f"Bearer {auth.create_token(self.user_id, 'employee')}"}
        response = self.update(email="changed@example.com", current_password="current-password")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["google_email"], "member@example.com")


if __name__ == "__main__":
    unittest.main()
