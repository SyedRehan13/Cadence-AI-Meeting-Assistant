from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

import psycopg

import database as db


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        url_patch = patch.object(db, "DATABASE_URL", "")
        url_patch.start()
        self.addCleanup(url_patch.stop)
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path_patch = patch.object(db, "DB_PATH", str(Path(temporary.name) / "test.db"))
        path_patch.start()
        self.addCleanup(path_patch.stop)
        db.init_db()

    def test_failed_transaction_rolls_back_all_writes(self):
        with self.assertRaises(RuntimeError):
            with db.get_conn() as conn:
                conn.execute(
                    "INSERT INTO users (name, email, password_hash, role, created_at) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    ("Member", "rollback@example.test", "unused", "employee", "2026-09-19"),
                )
                raise RuntimeError("abort")
        self.assertIsNone(db.get_user_by_email("rollback@example.test"))

    def test_project_membership_duplicate_is_ignored_but_invalid_user_is_rejected(self):
        manager = db.create_user("Manager", "pm@example.test", "unused", "pm")
        project = db.create_project("Project", "", manager)
        db.add_project_member(project, manager)
        db.add_project_member(project, manager)
        self.assertEqual(len(db.get_project_members(project)), 1)
        with self.assertRaises(db.INTEGRITY_ERRORS):
            db.add_project_member(project, manager + 100)

    def test_parameter_values_are_not_rewritten(self):
        name = "O'Brien? %s @ \\"
        user = db.create_user(name, "parameter@example.test", "unused", "employee")
        self.assertEqual(db.get_user_by_id(user)["name"], name)

    def test_postgres_connection_failure_never_opens_sqlite(self):
        with patch.object(db, "DATABASE_URL", "postgresql://example.invalid/postgres"):
            with patch.object(db.psycopg, "connect", side_effect=psycopg.OperationalError("offline")):
                with patch.object(db.sqlite3, "connect") as sqlite_connect:
                    with self.assertRaises(psycopg.OperationalError):
                        with db.get_conn():
                            self.fail("Connection must fail")
                    sqlite_connect.assert_not_called()

    def test_postgres_uses_tls_and_closes_transaction_on_error(self):
        with patch.object(db, "DATABASE_URL", "postgresql://example.invalid/postgres"):
            with patch.object(db.psycopg, "connect") as connect:
                with self.assertRaisesRegex(RuntimeError, "abort"):
                    with db.get_conn() as conn:
                        self.assertIs(conn, connect.return_value.__enter__.return_value)
                        raise RuntimeError("abort")
                self.assertEqual(connect.call_args.kwargs["sslmode"], "require")
                self.assertEqual(connect.call_args.kwargs["connect_timeout"], 10)
                self.assertIs(connect.return_value.__exit__.call_args.args[0], RuntimeError)

    def test_invalid_database_url_does_not_select_sqlite(self):
        with patch.object(db, "DATABASE_URL", "https://example.invalid"):
            with self.assertRaisesRegex(ValueError, "PostgreSQL connection URL"):
                with db.get_conn():
                    self.fail("Invalid URL must fail")

    def test_missing_database_url_does_not_recreate_old_sqlite_database(self):
        with patch.object(db, "DB_PATH", None):
            with patch.object(db.sqlite3, "connect") as connect:
                with self.assertRaisesRegex(ValueError, "Set DATABASE_URL"):
                    with db.get_conn():
                        self.fail("Missing configuration must fail")
                connect.assert_not_called()
