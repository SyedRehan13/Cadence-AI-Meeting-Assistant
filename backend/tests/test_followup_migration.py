import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

import database as db


class FollowupMigrationTests(unittest.TestCase):
    def setUp(self):
        url_patch = patch.object(db, "DATABASE_URL", "")
        url_patch.start()
        self.addCleanup(url_patch.stop)
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_patch = patch.object(db, "DB_PATH", str(Path(self.temp_dir.name) / "test.db"))
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        # Reproduce the schema before follow-ups tracked their recipients.
        with closing(sqlite3.connect(db.DB_PATH)) as conn:
            conn.execute("""
                CREATE TABLE followups (
                    id INTEGER PRIMARY KEY,
                    action_item_id INTEGER NOT NULL,
                    followup_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    sent_at TEXT,
                    status TEXT NOT NULL DEFAULT 'Draft'
                )
            """)
        db.init_db()
        self.pm = db.create_user("Manager", "pm@example.test", "unused", "pm")
        self.john = db.create_user("John", "john@example.test", "unused", "employee")
        self.other = db.create_user("Other", "other@example.test", "unused", "employee")
        meeting = db.add_meeting("Planning", "", "", self.pm)
        self.item = db.add_action_item(meeting, "Ship feature", "John", None, "High", "", self.john)
        self.pending = self.add_legacy_followup("Sent")
        self.draft = self.add_legacy_followup("Draft")
        self.responded = db.add_followup(self.item, "Email", "Update?", self.pm, self.john)
        db.mark_followup_sent(self.responded)
        db.add_employee_response(self.responded, "Work is progressing")

    def add_legacy_followup(self, status, item=None):
        with db.get_conn() as conn:
            return conn.execute(
                """INSERT INTO followups
                   (action_item_id, followup_type, message, created_at, sent_at, status)
                   VALUES (?, 'Email', 'Update?', '2026-09-01', ?, ?)""",
                (self.item if item is None else item, "2026-09-01" if status == "Sent" else None, status),
            ).lastrowid

    def test_legacy_sent_followup_is_visible_and_can_receive_a_response(self):
        self.assertEqual([row["id"] for row in db.get_received_followups(self.john)], [self.responded])

        db.init_db()

        inbox = {row["id"]: dict(row) for row in db.get_received_followups(self.john)}
        self.assertEqual(set(inbox), {self.pending, self.responded})
        self.assertEqual(inbox[self.pending]["recipient_user_id"], self.john)
        self.assertEqual(inbox[self.pending]["project_manager_name"], "Manager")
        self.assertIsNone(inbox[self.pending]["employee_response"])
        self.assertEqual(inbox[self.responded]["employee_response"], "Work is progressing")
        self.assertEqual(db.get_received_followups(self.other), [])
        self.assertEqual(db.get_followup(self.draft)["status"], "Draft")

        db.add_employee_response(self.pending, "Here is my update")
        self.assertEqual(db.get_followup(self.pending)["employee_response"], "Here is my update")

    def test_migration_is_idempotent_and_preserves_explicit_links(self):
        assigned_elsewhere = db.add_followup(self.item, "Email", "Other update?", self.other, self.other)
        db.mark_followup_sent(assigned_elsewhere)
        original = dict(db.get_followup(assigned_elsewhere))
        db.init_db()
        first = [dict(row) for row in db.get_followups(self.item)]
        db.init_db()
        self.assertEqual([dict(row) for row in db.get_followups(self.item)], first)
        self.assertEqual(dict(db.get_followup(assigned_elsewhere)), original)
        self.assertEqual([row["id"] for row in db.get_received_followups(self.other)], [assigned_elsewhere])

    def test_unassigned_items_are_not_delivered_to_an_arbitrary_employee(self):
        meeting = db.add_meeting("Unassigned", "", "", self.pm)
        item = db.add_action_item(meeting, "No owner", None, None, "High", "")
        unassigned = self.add_legacy_followup("Sent", item)
        db.init_db()
        self.assertIsNone(db.get_followup(unassigned)["recipient_user_id"])
        self.assertNotIn(unassigned, [row["id"] for row in db.get_received_followups(self.john)])


if __name__ == "__main__":
    unittest.main()
