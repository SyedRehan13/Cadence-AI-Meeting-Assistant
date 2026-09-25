from fastapi import APIRouter, HTTPException, Depends

import database as db
import ai
from schemas import ActionItemEdit, StatusUpdate, FollowupGenerate, FollowupEdit, FollowupSave, FollowupResponse
from deps import get_current_user, require_pm

router = APIRouter(prefix="/action-items", tags=["action-items"])
FOLLOWUP_TYPES = {"Email", "Professional Message", "Short Reminder"}


def _get_accessible_item(item_id, user):
    item = db.get_action_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    if user["role"] == "employee" and item["owner_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only access your own action items")
    return item


@router.patch("/{item_id}")
def edit_item(item_id: int, body: ActionItemEdit, user=Depends(require_pm)):
    item = db.get_action_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    if item["approved"]:
        raise HTTPException(status_code=400, detail="Approved items can no longer be edited, only status can change")
    if body.owner_user_id is not None:
        meeting = db.get_meeting(item["meeting_id"])
        if meeting and meeting["project_id"] and not db.is_project_member(meeting["project_id"], body.owner_user_id):
            raise HTTPException(status_code=400, detail="Owner must be a member of this meeting's project team")
    db.edit_action_item(item_id, body.task, body.owner_name, body.deadline, body.priority, body.owner_user_id)
    return {"ok": True}


@router.post("/{item_id}/approve")
def approve_item(item_id: int, user=Depends(require_pm)):
    item = db.get_action_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    db.approve_action_item(item_id)
    return {"ok": True}


@router.patch("/{item_id}/status")
def set_status(item_id: int, body: StatusUpdate, user=Depends(get_current_user)):
    item = db.get_action_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")
    if not item["approved"]:
        raise HTTPException(status_code=400, detail="Item is not approved yet")
    if user["role"] == "employee" and item["owner_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="You can only update your own action items")
    if body.status not in ("Pending", "In Progress", "Completed"):
        raise HTTPException(status_code=400, detail="Invalid status value")
    db.update_status(item_id, body.status)
    return {"ok": True}


@router.get("/my-followups")
def my_followups(user=Depends(get_current_user)):
    if user["role"] != "employee":
        raise HTTPException(status_code=403, detail="Employee account required")
    return [dict(row) for row in db.get_received_followups(user["id"])]


@router.post("/my-followups/{followup_id}/response")
def respond_to_followup(followup_id: int, body: FollowupResponse, user=Depends(get_current_user)):
    if user["role"] != "employee":
        raise HTTPException(status_code=403, detail="Employee account required")
    followup = db.get_followup(followup_id)
    if not followup or followup["recipient_user_id"] != user["id"] or followup["status"] != "Sent":
        raise HTTPException(status_code=404, detail="Follow-up not found")
    if not body.response.strip():
        raise HTTPException(status_code=400, detail="Response cannot be empty")
    db.add_employee_response(followup_id, body.response.strip())
    return {"ok": True}


@router.get("/{item_id}/followups")
def list_followups(item_id: int, user=Depends(require_pm)):
    _get_accessible_item(item_id, user)
    return [dict(row) for row in db.get_followups(item_id)]


@router.post("/{item_id}/followups")
def create_followup(item_id: int, body: FollowupGenerate, user=Depends(require_pm)):
    if body.followup_type not in FOLLOWUP_TYPES:
        raise HTTPException(status_code=400, detail="Invalid follow-up type")
    item = _get_accessible_item(item_id, user)
    item_data = dict(item)
    category = db.classify_action_item(item)
    if category == "Completed":
        raise HTTPException(status_code=400, detail="Completed action items do not need follow-up")
    try:
        message = ai.generate_action_followup(item_data, body.followup_type, category or "Follow-up")
    except Exception:
        raise HTTPException(status_code=503, detail="Unable to generate the follow-up right now. Please try again in a moment.")
    return {"action_item_id": item_id, "followup_type": body.followup_type, "message": message, "status": "Draft"}


@router.post("/{item_id}/followups/save")
def save_followup(item_id: int, body: FollowupSave, user=Depends(require_pm)):
    item = _get_accessible_item(item_id, user)
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Follow-up message cannot be empty")
    if body.followup_type not in FOLLOWUP_TYPES:
        raise HTTPException(status_code=400, detail="Invalid follow-up type")
    if not item["owner_user_id"]:
        raise HTTPException(status_code=400, detail="Assign an employee before sending a follow-up")
    followup_id = db.add_followup(item["id"], body.followup_type, body.message.strip(), user["id"], item["owner_user_id"])
    return {"id": followup_id, "action_item_id": item_id, "followup_type": body.followup_type, "message": body.message.strip(), "status": "Draft"}


@router.patch("/followups/{followup_id}/sent")
def mark_followup_sent(followup_id: int, user=Depends(require_pm)):
    followup = db.get_followup(followup_id)
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _get_accessible_item(followup["action_item_id"], user)
    db.mark_followup_sent(followup_id)
    return {"ok": True}


@router.patch("/followups/{followup_id}")
def edit_followup(followup_id: int, body: FollowupEdit, user=Depends(require_pm)):
    followup = db.get_followup(followup_id)
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _get_accessible_item(followup["action_item_id"], user)
    if followup["status"] == "Sent":
        raise HTTPException(status_code=400, detail="Sent follow-ups can no longer be edited")
    db.update_followup_message(followup_id, body.message)
    return {"ok": True}


