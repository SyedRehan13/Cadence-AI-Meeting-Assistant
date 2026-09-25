import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers import meetings
from deps import get_current_user


class RecordingDownloadTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(meetings.router)
        app.dependency_overrides[get_current_user] = lambda: {"id": 1, "role": "pm"}
        self.client = TestClient(app)

    def test_download_returns_bytes_with_unicode_attachment_filename(self):
        filename = 'Meeting café 日本語.mp3'
        meeting = {"recording_storage_path": "meetings/1/example.mp3",
                   "recording_filename": filename, "recording_mime_type": "audio/mpeg"}
        with patch.object(meetings.db, 'get_meeting', return_value=meeting), \
             patch.object(meetings.db, 'can_view_meeting', return_value=True), \
             patch.object(meetings.storage, 'download_recording', return_value=b'ID3-test'):
            response = self.client.get('/meetings/1/recording/download')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'ID3-test')
        self.assertIn("filename*=UTF-8''" + quote(filename, safe=''), response.headers['content-disposition'])

    def test_unauthorized_download_does_not_fetch_storage(self):
        with patch.object(meetings.db, 'get_meeting', return_value={"id": 1}), \
             patch.object(meetings.db, 'can_view_meeting', return_value=False), \
             patch.object(meetings.storage, 'download_recording') as fetch:
            response = self.client.get('/meetings/1/recording/download')
        self.assertEqual(response.status_code, 403)
        fetch.assert_not_called()


if __name__ == '__main__':
    unittest.main()
