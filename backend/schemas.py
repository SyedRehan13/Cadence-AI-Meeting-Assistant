from pydantic import BaseModel, Field, ConfigDict
from datetime import date
from typing import Optional, List, Literal


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str  # "pm" or "employee"


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=16384)
    nonce: str = Field(min_length=16, max_length=128)
    role: Literal["pm", "employee"] = "employee"
    password: Optional[str] = Field(default=None, max_length=1024)


class TokenResponse(BaseModel):
    access_token: str
    role: str
    name: str


class AccountProof(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: Optional[str] = Field(default=None, max_length=1024)
    credential: Optional[str] = Field(default=None, min_length=1, max_length=16384)
    nonce: Optional[str] = Field(default=None, min_length=16, max_length=128)


class ProfileUpdateRequest(AccountProof):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    job_title: str = Field(default="", max_length=100)
    department: str = Field(default="", max_length=100)


class PasswordChangeRequest(AccountProof):
    new_password: str = Field(min_length=8, max_length=72)


class GoogleLinkRequest(AccountProof):
    google_credential: str = Field(min_length=1, max_length=16384)
    google_nonce: str = Field(min_length=16, max_length=128)


class DeleteAccountRequest(AccountProof):
    confirmation: Literal["DELETE"]


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class AddMemberRequest(BaseModel):
    user_id: int


class AnalyzeRequest(BaseModel):
    title: str
    transcript: str
    project_id: int
    team: Optional[str] = None
    meeting_date: Optional[date] = None
    location: Optional[Literal["Meeting Room 1", "Meeting Room 2", "Meeting Room 3"]] = None


class ActionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ref_no: int
    action_or_decision: str = ""
    by_who: str = ""
    by_when: str = ""
    status_comments: str = ""


class DependencyBlockerIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ref_no: int
    description: str = ""
    owner: str = ""
    status: str = ""


class Milestone(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ref_no: int
    milestone: str = ""
    owner: str = ""
    target_date: str = ""
    status: str = ""


class MeetingDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")
    purpose: str = ""
    date: str = ""
    team: str = ""
    time: str = ""
    location: str = ""
    attendees: List[str] = Field(default_factory=list)
    project_manager: str = ""
    agenda: str = ""


class NextMeeting(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: str = ""
    facilitator: str = ""
    agenda: str = ""
    comments: str = ""


class MeetingMinutes(BaseModel):
    model_config = ConfigDict(extra="forbid")
    meeting_details: MeetingDetails
    meeting_summary: str = ""
    action_items: List[ActionDecision] = Field(default_factory=list)
    dependencies_blockers_issues: List[DependencyBlockerIssue] = Field(default_factory=list)
    milestones: List[Milestone] = Field(default_factory=list)
    next_meeting: NextMeeting


class MeetingEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=300)
    summary: str
    transcript: str
    decisions: List[str]
    questions: List[str]
    meeting_minutes: Optional[MeetingMinutes] = None


class ActionItemEdit(BaseModel):
    task: str
    owner_user_id: Optional[int] = None
    owner_name: str
    deadline: str
    priority: str


class StatusUpdate(BaseModel):
    status: str  # Pending / In Progress / Completed


class FollowupGenerate(BaseModel):
    followup_type: str


class FollowupEdit(BaseModel):
    message: str


class FollowupSave(BaseModel):
    followup_type: str
    message: str


class FollowupResponse(BaseModel):
    response: str
