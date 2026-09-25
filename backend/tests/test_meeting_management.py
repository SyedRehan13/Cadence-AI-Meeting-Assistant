import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
import database as db
from deps import get_current_user
from routers.meetings import router


class MeetingManagementTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        for name, value in [('DATABASE_URL', ''), ('DB_PATH', str(Path(temporary.name) / 'test.db'))]:
            patcher = patch.object(db, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        db.init_db()
        self.manager = db.create_user('Manager', 'manager@example.test', 'unused', 'pm')
        employee = db.create_user('Employee', 'employee@example.test', 'unused', 'employee')
        self.meeting = db.add_meeting('Before', 'Transcript', 'Summary', self.manager, recording={'storage_path': 'meetings/test.mp3'})
        self.other = db.add_meeting('Other', '', '', self.manager)
        db.add_decision(self.meeting, 'Old decision')
        db.add_question(self.meeting, 'Old question')
        self.item = db.add_action_item(self.meeting, 'Task', 'Employee', 'Tomorrow', 'Medium', '', employee)
        db.add_followup(self.item, 'reminder', 'Please reply', self.manager, employee)
        self.user = {'id': self.manager, 'role': 'pm'}
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)
        self.payload = dict(title='Updated', summary='New summary', transcript='New transcript', decisions=['New decision'], questions=[])

    def test_edit_preserves_tasks_and_recording(self):
        response = self.client.patch(f'/meetings/{self.meeting}', json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(db.get_meeting(self.meeting)['title'], 'Updated')
        self.assertEqual(db.get_meeting(self.meeting)['recording_storage_path'], 'meetings/test.mp3')
        self.assertEqual(len(db.get_action_items(self.meeting)), 1)
        self.assertEqual(db.get_decisions(self.meeting)[0]['decision'], 'New decision')
        self.assertEqual(len(db.get_questions(self.meeting)), 0)

    def test_minutes_summary_stays_in_sync_and_transcript_is_protected(self):
        minutes = {
            'meeting_details': {'purpose': 'Review'},
            'meeting_summary': 'Original summary',
            'action_items': [],
            'dependencies_blockers_issues': [],
            'milestones': [],
            'next_meeting': {},
        }
        meeting_id = db.add_meeting('Minutes', 'Original transcript', 'Original summary', self.manager,
                                    meeting_minutes=json.dumps(minutes))
        payload = dict(self.payload, transcript='Original transcript')
        self.assertEqual(self.client.patch(f'/meetings/{meeting_id}', json=payload).status_code, 200)
        saved = db.get_meeting(meeting_id)
        self.assertEqual(saved['summary'], 'New summary')
        self.assertEqual(json.loads(saved['meeting_minutes'])['meeting_summary'], 'New summary')
        payload['transcript'] = 'Changed transcript'
        self.assertEqual(self.client.patch(f'/meetings/{meeting_id}', json=payload).status_code, 400)
        self.assertEqual(db.get_meeting(meeting_id)['transcript'], 'Original transcript')

    def test_edit_all_minutes_fields_and_renumber_rows(self):
        minutes = {
            'meeting_details': {'purpose': 'Review', 'date': '2026-09-22', 'team': '', 'time': '',
                                'location': 'Meeting Room 1', 'attendees': ['Ahmed'],
                                'project_manager': '', 'agenda': ''},
            'meeting_summary': 'Original summary',
            'action_items': [{'ref_no': 7, 'action_or_decision': 'Update homepage', 'by_who': 'Ahmed',
                              'by_when': 'Thursday', 'status_comments': ''}],
            'dependencies_blockers_issues': [],
            'milestones': [],
            'next_meeting': {'date': '', 'facilitator': '', 'agenda': '', 'comments': ''},
        }
        meeting_id = db.add_meeting('Minutes', 'Original transcript', 'Original summary', self.manager,
                                    meeting_minutes=json.dumps(minutes))
        edited = dict(minutes, meeting_details=dict(minutes['meeting_details'], location='Meeting Room 3'),
                      meeting_summary='Edited summary')
        payload = dict(self.payload, transcript='Original transcript', meeting_minutes=edited)
        response = self.client.patch(f'/meetings/{meeting_id}', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        saved = db.get_meeting(meeting_id)
        self.assertEqual(saved['summary'], 'Edited summary')
        stored = json.loads(saved['meeting_minutes'])
        self.assertEqual(stored['meeting_details']['location'], 'Meeting Room 3')
        self.assertEqual(stored['action_items'][0]['ref_no'], 1)

    def test_selected_date_and_room_override_model_inference(self):
        project_id = db.create_project('Website', '', self.manager)
        minutes = {
            'meeting_details': {'purpose': '', 'date': 'wrong', 'team': '', 'time': '',
                                'location': 'wrong', 'attendees': [], 'project_manager': '', 'agenda': ''},
            'meeting_summary': '', 'action_items': [], 'dependencies_blockers_issues': [],
            'milestones': [], 'next_meeting': {'date': '', 'facilitator': '', 'agenda': '', 'comments': ''},
        }
        with patch('routers.meetings.ai.refine_and_extract_meeting', return_value=('Transcript', minutes)):
            response = self.client.post('/meetings/analyze', json={
                'title': 'Website review', 'transcript': 'Transcript', 'project_id': project_id,
                'meeting_date': '2026-09-22', 'location': 'Meeting Room 2',
            })
        self.assertEqual(response.status_code, 200, response.text)
        saved = db.get_meeting(response.json()['meeting_id'])
        details = json.loads(saved['meeting_minutes'])['meeting_details']
        self.assertEqual(details['date'], '2026-09-22')
        self.assertEqual(details['location'], 'Meeting Room 2')
        self.assertEqual(details['team'], 'Not specified')

    def test_explicit_team_overrides_default(self):
        project_id = db.create_project('Website', '', self.manager)
        minutes = {
            'meeting_details': {'purpose': '', 'date': '', 'team': 'invented by Gemini', 'time': '',
                                'location': '', 'attendees': [], 'project_manager': '', 'agenda': ''},
            'meeting_summary': '', 'action_items': [], 'dependencies_blockers_issues': [],
            'milestones': [], 'next_meeting': {'date': '', 'facilitator': '', 'agenda': '', 'comments': ''},
        }
        with patch('routers.meetings.ai.refine_and_extract_meeting', return_value=('Transcript', minutes)):
            response = self.client.post('/meetings/analyze', json={
                'title': 'Website review', 'transcript': 'Transcript', 'project_id': project_id,
                'team': 'Platform Team',
            })
        self.assertEqual(response.status_code, 200, response.text)
        saved = db.get_meeting(response.json()['meeting_id'])
        details = json.loads(saved['meeting_minutes'])['meeting_details']
        self.assertEqual(details['team'], 'Platform Team')

    def test_analyze_uses_current_system_time(self):
        project_id = db.create_project('Website', '', self.manager)
        minutes = {
            'meeting_details': {'purpose': '', 'date': '', 'team': '', 'time': 'old time',
                                'location': '', 'attendees': [], 'project_manager': '', 'agenda': ''},
            'meeting_summary': '', 'action_items': [], 'dependencies_blockers_issues': [],
            'milestones': [], 'next_meeting': {'date': '', 'facilitator': '', 'agenda': '', 'comments': ''},
        }
        with patch('routers.meetings.ai.refine_and_extract_meeting', return_value=('Transcript', minutes)):
            response = self.client.post('/meetings/analyze', json={
                'title': 'Website review', 'transcript': 'Transcript', 'project_id': project_id,
            })
        self.assertEqual(response.status_code, 200, response.text)
        saved = db.get_meeting(response.json()['meeting_id'])
        details = json.loads(saved['meeting_minutes'])['meeting_details']
        self.assertRegex(details['time'], r'^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$')

    def test_delete_cleans_dependents_only_for_selected_meeting(self):
        with patch('storage.delete_recording') as remove:
            response = self.client.delete(f'/meetings/{self.meeting}')
        self.assertEqual(response.status_code, 200)
        remove.assert_called_once_with('meetings/test.mp3')
        self.assertIsNone(db.get_meeting(self.meeting))
        self.assertIsNotNone(db.get_meeting(self.other))
        self.assertEqual(len(db.get_followups(self.item)), 0)
        self.assertEqual(len(db.get_action_items(self.meeting)), 0)
        self.assertEqual(len(db.get_decisions(self.meeting)), 0)
        self.assertEqual(len(db.get_questions(self.meeting)), 0)

    def test_storage_failure_rolls_back_deletion(self):
        with patch('storage.delete_recording', side_effect=RuntimeError('offline')):
            response = self.client.delete(f'/meetings/{self.meeting}')
        self.assertEqual(response.status_code, 502)
        self.assertIsNotNone(db.get_meeting(self.meeting))
        self.assertEqual(len(db.get_followups(self.item)), 1)
        self.assertEqual(len(db.get_decisions(self.meeting)), 1)

    def test_employee_cannot_modify_meetings(self):
        self.user = {'id': self.manager, 'role': 'employee'}
        self.assertEqual(self.client.patch(f'/meetings/{self.meeting}', json=self.payload).status_code, 403)
        self.assertEqual(self.client.delete(f'/meetings/{self.meeting}').status_code, 403)

    def test_blank_title_is_rejected(self):
        self.payload['title'] = '   '
        self.assertEqual(self.client.patch(f'/meetings/{self.meeting}', json=self.payload).status_code, 422)

    def test_missing_meeting(self):
        self.assertEqual(self.client.delete('/meetings/99999').status_code, 404)
        self.assertEqual(self.client.patch('/meetings/99999', json=self.payload).status_code, 404)
