"""
Cadence — AI layer
--------------------
All model calls live here, behind plain functions:
    transcribe_audio(audio_bytes, mime_type)
    refine_and_extract_meeting(transcript, meeting_title)
    assess_risk(pending_items)
    generate_followup(meeting_title, approved_items)

Groq performs speech-to-text; Gemini refines transcripts and produces meeting
analysis. Keeping this separate from the routers makes providers swappable.
"""

import os
import json
import time
from datetime import date

from google import genai
from google.genai import types
from groq import Groq
from dotenv import load_dotenv
from schemas import MeetingMinutes

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo"
MODELS = [
    model.strip()
    for model in os.getenv(
        "GEMINI_MODELS", "gemini-3.5-flash,gemini-2.5-flash-lite"
    ).split(",")
    if model.strip()
]
MAX_RETRIES = 3


def _generate_content(**kwargs):
    last_error = None
    for model in MODELS:
        for attempt in range(MAX_RETRIES):
            try:
                return client.models.generate_content(model=model, **kwargs)
            except Exception as exc:
                last_error = exc
                message = str(exc).lower()
                unavailable_model = "no longer available" in message or "model" in message and "not found" in message
                transient = any(
                    code in message for code in ("429", "500", "503", "unavailable", "high demand")
                )
                if unavailable_model:
                    break
                if not transient:
                    raise
                if attempt < MAX_RETRIES - 1:
                    time.sleep(2 ** attempt)
                else:
                    break
    raise last_error


def _call(system: str, user: str) -> str:
    response = _generate_content(
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
        ),
    )
    return response.text.strip()


def _call_text(system: str, user: str) -> str:
    """Same as _call but returns plain text (used for the follow-up message)."""
    response = _generate_content(
        contents=user,
        config=types.GenerateContentConfig(system_instruction=system),
    )
    return response.text.strip()


MERGE_EXTRACTION_PROMPT = """Combine partial meeting minutes into one accurate result. Return ONLY valid JSON in the exact Meeting Minutes schema. Deduplicate only truly identical items. Preserve all distinct actions, decisions, owners, deadlines, blockers, milestones, next-meeting details, and context. Do not invent facts or resolve contradictions; retain uncertainty where present. Renumber each array sequentially from 1."""
REFINE_AND_EXTRACT_PROMPT = """Analyze this meeting transcript and return ONLY valid JSON, never Markdown. The transcript may contain English, Urdu, Roman Urdu, or mixed Urdu-English. Interpret Urdu/Roman Urdu as clear professional English while preserving exact meaning, names, technical terminology, assignments, decisions, deadlines, and context. Never translate names, product names, code, or technical terms such as API, Supabase, Groq, Gemini, FastAPI, PostgreSQL, or React. Do not invent missing information: use an empty string or empty array when unavailable. Cadence has no Teams feature, so never infer or invent a team from the transcript, attendees, project manager, project, or meeting title; always return an empty string for team. Include only actual action items, blockers/issues, milestones, and next-meeting details. Number every array sequentially from 1.

Return this exact structure:
{
  "meeting_details": {"purpose":"","date":"","team":"","time":"","location":"","attendees":[],"project_manager":"","agenda":""},
  "meeting_summary":"",
  "action_items":[{"ref_no":1,"action_or_decision":"","by_who":"","by_when":"","status_comments":""}],
  "dependencies_blockers_issues":[{"ref_no":1,"description":"","owner":"","status":""}],
  "milestones":[{"ref_no":1,"milestone":"","owner":"","target_date":"","status":""}],
  "next_meeting":{"date":"","facilitator":"","agenda":"","comments":""}
}"""
TRANSCRIPT_CHUNK_CHARS = int(os.getenv("GEMINI_TRANSCRIPT_CHUNK_CHARS", "18000"))


def _split_text_logically(text: str, limit: int = TRANSCRIPT_CHUNK_CHARS) -> list[str]:
    if len(text) <= limit:
        return [text]
    chunks, remaining = [], text
    while len(remaining) > limit:
        boundary = max(remaining.rfind("\n\n", 0, limit), remaining.rfind("\n", 0, limit), remaining.rfind(". ", 0, limit))
        boundary = boundary + 1 if boundary >= limit // 2 else limit
        chunks.append(remaining[:boundary].strip())
        remaining = remaining[boundary:].lstrip()
    if remaining:
        chunks.append(remaining)
    return chunks


def _as_dict(value):
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return vars(value)


def _format_timestamp(seconds) -> str:
    seconds = max(0, int(float(seconds or 0)))
    hours, seconds = divmod(seconds, 3600)
    minutes, seconds = divmod(seconds, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def transcribe_audio(audio_bytes: bytes, mime_type: str, filename: str = "recording.wav", offset_seconds: float = 0) -> str:
    """Transcribe one Groq audio chunk and retain segment timestamps."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured in the backend environment")
    response = Groq(api_key=api_key).audio.transcriptions.create(
        file=(filename, audio_bytes, mime_type), model=GROQ_TRANSCRIPTION_MODEL,
        response_format="verbose_json", timestamp_granularities=["segment"], temperature=0.0,
    )
    payload = _as_dict(response)
    lines = []
    for segment in payload.get("segments") or []:
        segment = _as_dict(segment)
        text = (segment.get("text") or "").strip()
        if text:
            start = _format_timestamp(float(segment.get("start", 0)) + offset_seconds)
            end = _format_timestamp(float(segment.get("end", 0)) + offset_seconds)
            lines.append(f"[{start} - {end}] {text}")
    return "\n".join(lines) if lines else (payload.get("text") or getattr(response, "text", "")).strip()


def refine_and_extract_meeting(transcript: str, meeting_title: str = "") -> tuple[str, dict]:
    """One Gemini call for normal transcripts; validate exact meeting-minutes JSON."""
    chunks = _split_text_logically(transcript)
    if len(chunks) == 1:
        raw = _call(REFINE_AND_EXTRACT_PROMPT, json.dumps({"meeting_title": meeting_title, "transcript": transcript}, ensure_ascii=False))
        minutes = MeetingMinutes.model_validate_json(raw).model_dump()
        return transcript, minutes
    partials = [MeetingMinutes.model_validate_json(_call(REFINE_AND_EXTRACT_PROMPT, json.dumps({"meeting_title": meeting_title, "transcript": chunk}, ensure_ascii=False))).model_dump() for chunk in chunks]
    merged = MeetingMinutes.model_validate_json(_call(MERGE_EXTRACTION_PROMPT + "\nReturn the exact Meeting Minutes schema.", json.dumps(partials, ensure_ascii=False))).model_dump()
    return transcript, merged


RISK_PROMPT = """You review a list of pending action items from past meetings and flag
which ones may be at risk of being missed. Today's date is provided.

Return ONLY valid JSON, no markdown fences, no commentary. Use this schema:

{
  "at_risk": [
    {"id": <item id as given>, "reason": "one short sentence explaining why this is at risk"}
  ]
}

Only flag items that are genuinely concerning: overdue, due very soon with no progress,
or vague/unassigned. Do not flag items that look fine. If nothing is concerning, return
an empty at_risk list. Do not invent details not present in the item data.
"""


def assess_risk(pending_items: list) -> dict:
    """pending_items: list of dicts with id, task, owner, deadline, status."""
    if not pending_items:
        return {"at_risk": []}
    payload = json.dumps({"today": date.today().isoformat(), "items": pending_items}, indent=2)
    raw = _call(RISK_PROMPT, payload)
    return json.loads(raw)


FOLLOWUP_PROMPT = """You write a short, natural follow-up message summarizing a meeting's
approved action items. You are given ONLY verified, human-approved data — never add,
remove, or change any task, owner, or deadline from what's provided. Your job is only to
write natural connective sentences around this data, not to invent new facts.

Return plain text only (not JSON) — a short message ready to paste into Slack or email.
Keep it under 150 words. Match a professional but warm tone.
"""


def generate_followup(meeting_title: str, approved_items: list) -> str:
    payload = json.dumps({"meeting": meeting_title, "action_items": approved_items}, indent=2)
    return _call_text(FOLLOWUP_PROMPT, payload)


FOLLOWUP_TYPES = {"Email", "Professional Message", "Short Reminder"}


def generate_action_followup(item: dict, followup_type: str, category: str) -> str:
    """Generate a reviewable message from one stored commitment."""
    tone = "slightly direct because the commitment is overdue" if category == "Overdue" else "professional and concise"
    system = f"""You write a {followup_type.lower()} follow-up for one real meeting commitment.
Use only the supplied facts. Never invent an owner, deadline, blocker, meeting detail, or commitment.
If a value is unknown, avoid mentioning it. The tone must be {tone}.
Return only the message text, with no subject line unless the type is Email."""
    payload = json.dumps({
        "action": item.get("task"),
        "owner": item.get("owner_name"),
        "deadline": item.get("deadline"),
        "status": item.get("status"),
        "priority": item.get("priority"),
        "meeting": item.get("meeting_title"),
        "evidence": item.get("evidence"),
        "follow_up_category": category,
    }, indent=2)
    return _call_text(system, payload)
