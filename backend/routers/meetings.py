from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response
import io
import json
from datetime import date, datetime
from pathlib import Path
from uuid import uuid4
from urllib.parse import quote

import database as db
import ai
import storage
from schemas import AnalyzeRequest, MeetingEdit
from deps import get_current_user, require_pm

router = APIRouter(prefix="/meetings", tags=["meetings"])


ROOMS = {"Meeting Room 1", "Meeting Room 2", "Meeting Room 3"}


def _save_extracted_meeting(title: str, transcript: str, project_id: int, user_id: int, recording=None, meeting_date=None, location=None, team=None) -> int:
    """Shared by both /analyze (pasted text) and /analyze-file (upload) —
    runs extraction and saves everything to the database."""
    try:
        transcript, data = ai.refine_and_extract_meeting(transcript, title)
    except Exception as e:
        message = str(e)
        if any(code in message.lower() for code in ("429", "500", "503", "unavailable", "high demand")):
            raise HTTPException(
                status_code=503,
                detail="AI extraction is temporarily unavailable because the Gemini model is at capacity. Please try again in a minute.",
            )
        raise HTTPException(status_code=502, detail=f"AI extraction failed: {e}")

    # Explicit form metadata takes precedence over model inference.
    data["meeting_details"]["date"] = (meeting_date or date.today()).isoformat()
    data["meeting_details"]["time"] = datetime.now().strftime("%I:%M %p")
    data["meeting_details"]["team"] = team.strip() if team and team.strip() else "Not specified"
    if location:
        data["meeting_details"]["location"] = location
    meeting_id = db.add_meeting(title or "Untitled meeting", transcript, data.get("meeting_summary", ""), user_id, project_id, recording, json.dumps(data, ensure_ascii=False))
    for item in data.get("action_items", []):
        db.add_action_item(
            meeting_id,
            item.get("action_or_decision", ""),
            item.get("by_who") or "Unassigned",
            item.get("by_when") or "Not specified",
            "Medium",
            item.get("status_comments", ""),
        )
    return meeting_id


def _extract_pdf_text(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(status_code=500, detail="pypdf isn't installed on the server")
    reader = PdfReader(io.BytesIO(file_bytes))
    text = "\n".join((page.extract_text() or "") for page in reader.pages)
    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Couldn't extract any text from this PDF — it may be a scanned/image-only PDF, which isn't supported yet.",
        )
    return text


# Media formats accepted by Cadence uploads.
AUDIO_MIME_TYPES = {
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".aiff": "audio/aiff",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
}
VIDEO_MIME_TYPES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
}

# Formats browsers actually record with MediaRecorder.
BROWSER_RECORDING_EXTS = {".webm", ".weba"}


GROQ_MAX_UPLOAD_BYTES = 24 * 1024 * 1024
GROQ_CHUNK_MS = 10 * 60 * 1000


def _audio_chunks_for_groq(file_bytes: bytes, source_ext: str):
    """Preprocess large/incompatible media and return chronological Groq chunks."""
    direct_extensions = {".flac", ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".ogg", ".wav", ".webm"}
    if source_ext in direct_extensions and len(file_bytes) <= GROQ_MAX_UPLOAD_BYTES:
        mime_type = {**AUDIO_MIME_TYPES, **VIDEO_MIME_TYPES}.get(source_ext, "audio/webm")
        return [(file_bytes, mime_type, f"recording{source_ext}", 0)]
    try:
        from pydub import AudioSegment
    except ImportError:
        raise HTTPException(status_code=500, detail="pydub isn't installed on the server (needed to process this recording).")
    try:
        audio = AudioSegment.from_file(io.BytesIO(file_bytes), format=source_ext.lstrip("."))
        audio = audio.set_frame_rate(16000).set_channels(1)
        chunks = []
        for start_ms in range(0, len(audio), GROQ_CHUNK_MS):
            out = io.BytesIO()
            audio[start_ms:start_ms + GROQ_CHUNK_MS].export(out, format="flac")
            encoded = out.getvalue()
            if len(encoded) > GROQ_MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Audio chunk is too large after preprocessing; please upload a shorter recording.")
            chunks.append((encoded, "audio/flac", f"chunk-{start_ms // 1000:06d}.flac", start_ms / 1000))
        return chunks
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Couldn't process the recording (is ffmpeg installed on the server?): {e}")


def _transcribe_uploaded_audio(filename: str, file_bytes: bytes) -> str:
    """Handles both plain uploads (mp3/wav/m4a/...) and live browser
    recordings (webm), with Groq transcription and preprocessing as needed."""
    ext = "." + filename.rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in {**AUDIO_MIME_TYPES, **VIDEO_MIME_TYPES} and ext not in BROWSER_RECORDING_EXTS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use .txt, .pdf, .mp3, .wav, .m4a, .ogg, .aac, .aiff, .flac, or record live.",
        )
    try:
        return "\n".join(
            ai.transcribe_audio(audio_bytes, mime_type, chunk_name, offset_seconds)
            for audio_bytes, mime_type, chunk_name, offset_seconds in _audio_chunks_for_groq(file_bytes, ext)
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Audio transcription failed: {e}")


@router.post("/analyze")
def analyze_meeting(body: AnalyzeRequest, user=Depends(require_pm)):
    if not db.get_project(body.project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    meeting_id = _save_extracted_meeting(body.title, body.transcript, body.project_id, user["id"], meeting_date=body.meeting_date, location=body.location, team=body.team)
    return {"meeting_id": meeting_id}


@router.post("/analyze-file")
async def analyze_meeting_file(
    title: str = Form(...),
    project_id: int = Form(...),
    file: UploadFile = File(...),
    duration: float = Form(None),
    meeting_date: date = Form(None),
    location: str = Form(None),
    team: str = Form(None),
    user=Depends(require_pm),
):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if location and location not in ROOMS:
        raise HTTPException(status_code=422, detail="Select Meeting Room 1, 2, or 3")

    filename = (file.filename or "").lower()
    file_bytes = await file.read()

    recording = None
    if filename.endswith(".txt"):
        transcript = file_bytes.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf"):
        transcript = _extract_pdf_text(file_bytes)
    elif any(filename.endswith(ext) for ext in AUDIO_MIME_TYPES) or any(filename.endswith(ext) for ext in VIDEO_MIME_TYPES) or any(filename.endswith(ext) for ext in BROWSER_RECORDING_EXTS):
        mime_type = file.content_type or {**AUDIO_MIME_TYPES, **VIDEO_MIME_TYPES}.get(
            "." + filename.rsplit(".", 1)[-1], "application/octet-stream"
        )
        # Object keys must be URL-safe because they become part of a signed
        # playback URL. Keep the user's filename as display metadata only.
        storage_path = f"meetings/{user['id']}/{uuid4().hex}{Path(file.filename or 'recording').suffix.lower()}"
        try:
            storage.upload_recording(storage_path, file_bytes, mime_type)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Meeting recording could not be stored: {e}")
        recording = {
            "storage_path": storage_path,
            "filename": file.filename or "recording",
            "mime_type": mime_type,
            "file_size": len(file_bytes),
            "duration": duration,
        }
        transcript = _transcribe_uploaded_audio(filename, file_bytes)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use .txt, .pdf, common audio/video files, or record live.",
        )

    meeting_id = _save_extracted_meeting(title, transcript, project_id, user["id"], recording, meeting_date, location, team)
    return {"meeting_id": meeting_id, "transcript_preview": transcript[:500]}


@router.get("")
def list_meetings(user=Depends(get_current_user)):
    return [dict(m) for m in db.get_meetings(user["id"], user["role"])]


@router.get("/{meeting_id}")
def meeting_detail(meeting_id: int, user=Depends(get_current_user)):
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not db.can_view_meeting(meeting, user):
        raise HTTPException(status_code=403, detail="You are not authorized to view this meeting")
    meeting_data = dict(meeting)
    if meeting_data.get("meeting_minutes"):
        try:
            meeting_data["meeting_minutes"] = json.loads(meeting_data["meeting_minutes"])
        except json.JSONDecodeError:
            meeting_data["meeting_minutes"] = None
    if meeting_data.get("recording_storage_path"):
        try:
            meeting_data["recording_url"] = storage.signed_recording_url(meeting_data["recording_storage_path"])
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Meeting recording could not be opened: {e}")
    return {
        "meeting": meeting_data,
        "decisions": [dict(d) for d in db.get_decisions(meeting_id)],
        "questions": [dict(q) for q in db.get_questions(meeting_id)],
        "action_items": [dict(i) for i in db.get_action_items(meeting_id)],
    }


@router.get("/{meeting_id}/recording/download")
def download_meeting_recording(meeting_id: int, user=Depends(get_current_user)):
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not db.can_view_meeting(meeting, user):
        raise HTTPException(status_code=403, detail="You are not authorized to download this meeting recording")
    if not meeting["recording_storage_path"]:
        raise HTTPException(status_code=404, detail="This meeting has no stored recording")
    try:
        content = storage.download_recording(meeting["recording_storage_path"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Meeting recording could not be downloaded: {e}")

    filename = meeting["recording_filename"] or "meeting-recording"
    encoded_filename = quote(filename, safe="")
    return Response(
        content=content,
        media_type=meeting["recording_mime_type"] or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename=\"meeting-recording\"; filename*=UTF-8''{encoded_filename}",
            "Cache-Control": "private, no-store",
        },
    )


@router.patch("/{meeting_id}")
def edit_meeting(meeting_id: int, body: MeetingEdit, user=Depends(require_pm)):
    if not db.get_meeting(meeting_id):
        raise HTTPException(status_code=404, detail="Meeting not found")
    try:
        db.edit_meeting(meeting_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "updated"}


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: int, user=Depends(require_pm)):
    if not db.get_meeting(meeting_id):
        raise HTTPException(status_code=404, detail="Meeting not found")
    try:
        db.delete_meeting(meeting_id, storage.delete_recording)
    except RuntimeError:
        raise HTTPException(status_code=502, detail="The recording could not be deleted. Meeting data has been kept; please retry.")
    return {"status": "deleted"}


@router.post("/{meeting_id}/followup")
def followup(meeting_id: int, user=Depends(require_pm)):
    meeting = db.get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    items = [dict(i) for i in db.get_action_items(meeting_id, approved_only=True)]
    try:
        message = ai.generate_followup(meeting["title"], items)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI follow-up generation failed: {e}")
    return {"message": message}
