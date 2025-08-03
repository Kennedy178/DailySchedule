import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from uuid import UUID
from datetime import time, date
from typing import Optional
from backend.utils.supabase_client import supabase
from backend.utils.auth_utils import verify_token

# Set up module-level logger
logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models for task creation/update
class TaskCreate(BaseModel):
    name: str
    start_time: time
    end_time: time
    category: str
    priority: str
    completed: bool = False
    is_late: bool = False
    created_at: date

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    completed: Optional[bool] = None
    is_late: Optional[bool] = None

@router.post("/", response_model=dict)
async def create_task(task: TaskCreate, user_id: str = Depends(verify_token)):
    try:
        payload = {
            "user_id": user_id,
            "name": task.name,
            "start_time": task.start_time.isoformat(),
            "end_time": task.end_time.isoformat(),
            "category": task.category,
            "priority": task.priority,
            "completed": task.completed,
            "is_late": task.is_late,
            "created_at": task.created_at.isoformat()
        }

        # Log the payload to file (for debugging without polluting console)
        logger.info(f"Inserting task payload: {payload}")

        data = supabase.table("tasks").insert(payload).execute()
        return data.data[0]
    except Exception as e:
        logger.error(f"Task insert failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/", response_model=list[dict])
async def get_tasks(user_id: str = Depends(verify_token)):
    try:
        logger.info(f"Fetching tasks for user {user_id}")
        data = supabase.table("tasks").select("*").eq("user_id", user_id).execute()
        return data.data
    except Exception as e:
        logger.error(f"Task fetch failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.put("/{task_id}", response_model=dict)
async def update_task(task_id: UUID, task: TaskUpdate, user_id: str = Depends(verify_token)):
    try:
        update_data = {k: v for k, v in task.dict().items() if v is not None}
        if "start_time" in update_data:
            update_data["start_time"] = update_data["start_time"].isoformat()
        if "end_time" in update_data:
            update_data["end_time"] = update_data["end_time"].isoformat()

        logger.info(f"Updating task {task_id} for user {user_id} with {update_data}")

        data = supabase.table("tasks").update(update_data).eq("id", str(task_id)).eq("user_id", user_id).execute()
        if not data.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        return data.data[0]
    except Exception as e:
        logger.error(f"Task update failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/{task_id}", response_model=dict)
async def delete_task(task_id: UUID, user_id: str = Depends(verify_token)):
    try:
        logger.info(f"Deleting task {task_id} for user {user_id}")
        data = supabase.table("tasks").delete().eq("id", str(task_id)).eq("user_id", user_id).execute()
        if not data.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        return {"message": "Task deleted"}
    except Exception as e:
        logger.error(f"Task delete failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
