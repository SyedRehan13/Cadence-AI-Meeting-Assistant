from fastapi import APIRouter, HTTPException, Depends

import database as db
from schemas import ProjectCreate, AddMemberRequest
from deps import get_current_user, require_pm

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
def create_project(body: ProjectCreate, user=Depends(require_pm)):
    project_id = db.create_project(body.name, body.description, user["id"])
    return {"project_id": project_id}


@router.get("")
def list_projects(user=Depends(get_current_user)):
    return [dict(p) for p in db.get_projects()]


@router.get("/{project_id}")
def project_detail(project_id: int, user=Depends(get_current_user)):
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "project": dict(project),
        "members": [dict(m) for m in db.get_project_members(project_id)],
    }


@router.delete("/{project_id}")
def delete_project(project_id: int, user=Depends(require_pm)):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete_project(project_id)
    return {"ok": True}


@router.post("/{project_id}/members")
def add_member(project_id: int, body: AddMemberRequest, user=Depends(require_pm)):
    if not db.get_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    target = db.get_user_by_id(body.user_id)
    if not target or target["role"] != "employee":
        raise HTTPException(status_code=400, detail="Can only add existing employee accounts to a team")
    db.add_project_member(project_id, body.user_id)
    return {"ok": True}


@router.delete("/{project_id}/members/{user_id}")
def remove_member(project_id: int, user_id: int, user=Depends(require_pm)):
    db.remove_project_member(project_id, user_id)
    return {"ok": True}
