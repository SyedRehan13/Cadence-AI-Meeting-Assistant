from fastapi import APIRouter, HTTPException, Depends

import database as db
import ai
from deps import get_current_user, require_pm

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(user=Depends(get_current_user)):
    owner_filter = user["id"] if user["role"] == "employee" else None
    items = db.get_action_items(approved_only=True, owner_user_id=owner_filter)
    items_with_categories = []
    for item in items:
        item_data = dict(item)
        item_data["follow_up_status"] = db.classify_action_item(item)
        items_with_categories.append(item_data)
    overdue = [i for i in db.get_overdue_items() if owner_filter is None or i["owner_user_id"] == owner_filter]
    counts = {"Pending": 0, "In Progress": 0, "Completed": 0}
    for i in items:
        counts[i["status"]] = counts.get(i["status"], 0) + 1

    projects = (
        [dict(p) for p in db.get_user_projects(user["id"])]
        if user["role"] == "employee"
        else [dict(p) for p in db.get_projects()]
    )

    return {
        "total": len(items),
        "counts": counts,
        "overdue": [dict(i) for i in overdue],
        "items": items_with_categories,
        "follow_ups": {
            "due_soon": [i for i in items_with_categories if i["follow_up_status"] == "Due Soon"],
            "overdue": [i for i in items_with_categories if i["follow_up_status"] == "Overdue"],
            "at_risk": [i for i in items_with_categories if i["follow_up_status"] == "At Risk"],
            "completed": [i for i in items_with_categories if i["follow_up_status"] == "Completed"],
        },
        "projects": projects,
    }


@router.post("/risk-check")
def risk_check(user=Depends(require_pm)):
    items = db.get_action_items(approved_only=True)
    pending = [dict(i) for i in items if i["status"] != "Completed"]
    try:
        return ai.assess_risk(pending)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI risk check failed: {e}")
