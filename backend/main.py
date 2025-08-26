import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.routes.tasks import router as tasks_router
from backend.utils.auth_utils import verify_token
from backend.routes.fcm import router as fcm_router
from backend.utils.fcm_service import initialize_firebase, send_task_reminder
from backend.utils.supabase_client import supabase
# Add this import to your main.py
from backend.routes.contact import router as contact_router


logging.basicConfig(
    level=logging.ERROR,   # <--- switched to ERROR from INFO--> which allowed info+warning+error
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("app.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Global scheduler instance
scheduler = None

# Global notification cache to prevent spam (key: task_id_user_id, value: timestamp)
recent_notifications = {}

def clean_notification_cache():
    """Clean old entries from notification cache (older than 15 minutes)"""
    global recent_notifications
    cutoff = datetime.now() - timedelta(minutes=15)
    cutoff_timestamp = cutoff.timestamp()
    
    keys_to_remove = [
        key for key, timestamp in recent_notifications.items() 
        if timestamp < cutoff_timestamp
    ]
    
    for key in keys_to_remove:
        del recent_notifications[key]
    
    if keys_to_remove:
        logger.debug(f"Cleaned {len(keys_to_remove)} old notification cache entries")

def has_recent_notification(task_id: str, user_id: str) -> bool:
    """Check if we've sent a notification for this task recently"""
    cache_key = f"{task_id}_{user_id}"
    if cache_key in recent_notifications:
        # Check if it's within the last 10 minutes
        time_diff = datetime.now().timestamp() - recent_notifications[cache_key]
        return time_diff < 10 * 60  # 10 minutes in seconds
    return False

def mark_notification_sent(task_id: str, user_id: str):
    """Mark that we've sent a notification for this task"""
    cache_key = f"{task_id}_{user_id}"
    recent_notifications[cache_key] = datetime.now().timestamp()

async def get_user_display_name(user_id: str) -> str:
    """
    Get user's display name from Supabase auth.users table or profiles table.
    Falls back to 'you' if not found.
    """
    try:
        # First, try to get from auth.users metadata
        # Let's try querying the users table directly if accessible  
        # Option 1: Try profiles table on supabase db(already exists)
        profiles_response = supabase.table("profiles").select("full_name, display_name").eq("id", user_id).execute()
        
        if profiles_response.data and len(profiles_response.data) > 0:
            profile = profiles_response.data[0]
            name = profile.get("display_name") or profile.get("full_name")

            if name:
                return name.strip()
        
        # Option 2: Try auth.users table (may require RLS bypass)--but already tken careof n its a fallback after all--
        users_response = supabase.table("auth.users").select("email, raw_user_meta_data").eq("id", user_id).execute()
        
        if users_response.data and len(users_response.data) > 0:
            user = users_response.data[0]
            
            # Try metadata first
            metadata = user.get("raw_user_meta_data") or {}
            name = (
                metadata.get("full_name") or 
                metadata.get("name") or 
                metadata.get("first_name")
            )
            if name:
                return name.strip()
            
            # Fall back to email username
            email = user.get("email")
            if email:
                return email.split("@")[0]
        
    except Exception as e:
        logger.warning(f"Could not fetch user display name for {user_id}: {str(e)}")
    
    # Final fallback
    return "you"

async def check_upcoming_tasks():
    """
    Background job that runs every 60 seconds to check for upcoming tasks
    and send FCM notifications to authenticated users.
    """
    try:
        logger.info("Running scheduled task reminder check...")
        
        # Clean old notification cache entries
        clean_notification_cache()
        
        # Get current time
        now = datetime.now()
        current_date = now.date()
        current_datetime = now
        
        # Calculate time window (9.5 to 10.5 minutes from now)
        # Using slightly wider window to account for processing delays
        start_window = current_datetime + timedelta(minutes=9, seconds=30)
        end_window = current_datetime + timedelta(minutes=10, seconds=30)
        
        # Convert to time strings for database query
        start_time_str = start_window.time().strftime("%H:%M:%S")
        end_time_str = end_window.time().strftime("%H:%M:%S")
        
        logger.debug(f"Checking for tasks between {start_time_str} and {end_time_str} on {current_date}")
        
        upcoming_tasks = []
        
        try:
            # Handle potential midnight crossover
            if start_window.date() == end_window.date():
                # Same day - simple range query
                tasks_response = supabase.table("tasks").select(
                    "id, user_id, name, start_time, priority, created_at"
                ).eq(
                    "completed", False
                ).eq(
                    "created_at", current_date.isoformat()  # Today's tasks only
                ).gte(
                    "start_time", start_time_str
                ).lte(
                    "start_time", end_time_str
                ).not_.is_(
                    "user_id", "null"  # Only authenticated users
                ).execute()
                
                upcoming_tasks = tasks_response.data or []
                
            else:
                # Midnight crossover - need two queries
                # This is rare but possible if checking near midnight
                logger.debug("Handling midnight crossover in time window")
                
                # Query for tasks before midnight
                tasks_response_1 = supabase.table("tasks").select(
                    "id, user_id, name, start_time, priority, created_at"
                ).eq(
                    "completed", False
                ).eq(
                    "created_at", current_date.isoformat()
                ).gte(
                    "start_time", start_time_str
                ).lte(
                    "start_time", "23:59:59"
                ).not_.is_(
                    "user_id", "null"
                ).execute()
                
                # Query for tasks after midnight
                tasks_response_2 = supabase.table("tasks").select(
                    "id, user_id, name, start_time, priority, created_at"
                ).eq(
                    "completed", False
                ).eq(
                    "created_at", end_window.date().isoformat()
                ).gte(
                    "start_time", "00:00:00"
                ).lte(
                    "start_time", end_time_str
                ).not_.is_(
                    "user_id", "null"
                ).execute()
                
                # Combine results
                upcoming_tasks = (tasks_response_1.data or []) + (tasks_response_2.data or [])
                
        except Exception as e:
            logger.error(f"Supabase error fetching upcoming tasks: {str(e)}")
            return
        
        
        if not upcoming_tasks:
            logger.debug("No upcoming tasks found")
            return
            
        logger.info(f"Found {len(upcoming_tasks)} upcoming tasks")
        
        # Group tasks by user_id and filter out recent notifications
        users_with_tasks = {}
        filtered_count = 0
        
        for task in upcoming_tasks:
            user_id = task["user_id"]
            task_id = task["id"]
            
            # Check if we've sent a notification for this task recently
            if has_recent_notification(str(task_id), user_id):
                logger.debug(f"Skipping task {task_id} - notification sent recently")
                filtered_count += 1
                continue
            
            if user_id not in users_with_tasks:
                users_with_tasks[user_id] = []
            users_with_tasks[user_id].append(task)
        
        if filtered_count > 0:
            logger.info(f"Filtered out {filtered_count} tasks with recent notifications")
        
        if not users_with_tasks:
            logger.debug("No tasks remaining after filtering recent notifications")
            return
        
        # Send notifications to each user
        total_sent = 0
        total_failed = 0
        
        for user_id, user_tasks in users_with_tasks.items():
            try:
                # Get user's display name
                user_name = await get_user_display_name(user_id)
                
                # Send notification for each task
                for task in user_tasks:
                    task_name = task["name"]
                    priority = task.get("priority") or "Medium"
                    task_id = str(task["id"])
                    
                    try:
                        # Send the notification
                        success = await send_task_reminder(
                            user_id=user_id,
                            task_name=task_name,
                            priority=priority,
                            user_name=user_name
                        )
                        
                        if success:
                            total_sent += 1
                            mark_notification_sent(task_id, user_id)
                            logger.info(f"✅ Sent task reminder '{task_name}' to user {user_id}")
                        else:
                            total_failed += 1
                            logger.warning(f"❌ Failed to send task reminder '{task_name}' to user {user_id}")
                            
                    except Exception as task_error:
                        total_failed += 1
                        logger.error(f"Error sending notification for task '{task_name}' to user {user_id}: {str(task_error)}")
                        
            except Exception as user_error:
                total_failed += len(user_tasks)
                logger.error(f"Error processing tasks for user {user_id}: {str(user_error)}")
                continue
        
        if total_sent > 0 or total_failed > 0:
            logger.info(f"Task reminder check completed: ✅ {total_sent} sent, ❌ {total_failed} failed, 👥 {len(users_with_tasks)} users")
        else:
            logger.debug("Task reminder check completed - no notifications sent")
        
    except Exception as e:
        logger.error(f"Critical error in scheduled task reminder check: {str(e)}")

        
def start_scheduler():
    """Start the background scheduler for FCM notifications."""
    global scheduler
    
    try:
        scheduler = AsyncIOScheduler()
        
        # Schedule the task reminder check to run every 60 seconds
        scheduler.add_job(
            check_upcoming_tasks,
            trigger=IntervalTrigger(seconds=60),
            id="task_reminder_check",
            name="Check for upcoming tasks and send FCM notifications",
            replace_existing=True,
            max_instances=1,  # Prevent overlapping runs
            misfire_grace_time=30  # Allow 30s grace period for missed runs
        )
        
        scheduler.start()
        logger.info("🔔 FCM notification scheduler started - checking every 60 seconds")
        
        # Run initial check after a brief delay
        scheduler.add_job(
            check_upcoming_tasks,
            trigger='date',
            run_date=datetime.now() + timedelta(seconds=10),
            id="initial_task_check",
            name="Initial task reminder check"
        )
        
    except Exception as e:
        logger.error(f"Failed to start scheduler: {str(e)}")

def stop_scheduler():
    """Stop the background scheduler."""
    global scheduler
    
    if scheduler and scheduler.running:
        try:
            scheduler.shutdown(wait=True)
            logger.info("🔔 FCM notification scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {str(e)}")

# Lifespan function to replace deprecated @app.on_event("startup")
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    try:
        # Initialize Firebase first
        initialize_firebase()
        logger.info("🔥 Firebase initialized successfully")
        
        # Start the notification scheduler
        start_scheduler()
        logger.info("🚀 Application startup completed")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize application: {str(e)}. Continuing without FCM.")
    
    yield
    
    # Shutdown code
    try:
        # Stop the scheduler gracefully
        stop_scheduler()
        logger.info("🛑 Application shutdown completed")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="GetItDone API",
    description="Task management API with FCM notifications",
    version="1.0.0",
    lifespan=lifespan
)
app.include_router(contact_router)
# DEVELOPMENT-ONLY: Add CORS middleware to allow frontend requests
# In production, update allow_origins to your frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5500", "https://your-domain.com"],  # Add your production domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Log that the app started
logger.info("🚀 FastAPI application starting...")

# Include routers
app.include_router(tasks_router, prefix="/tasks", tags=["Tasks"])
app.include_router(fcm_router, prefix="/api/fcm", tags=["FCM Notifications"])

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint - API status"""
    logger.info("Root endpoint accessed")
    return {
        "message": "GetItDone API v1.0.0",
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint that includes scheduler and Firebase status."""
    global scheduler
    
    scheduler_status = "running" if scheduler and scheduler.running else "stopped"
    
    # Check Firebase status
    firebase_status = "unknown"
    try:
        from backend.utils.fcm_service import get_firebase_app
        firebase_app = get_firebase_app()
        firebase_status = "initialized" if firebase_app else "failed"
    except Exception:
        firebase_status = "error"
    
    # Get notification cache stats
    cache_size = len(recent_notifications)
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "scheduler": scheduler_status,
            "firebase": firebase_status,
            "notification_cache": cache_size
        }
    }

# Optional: Add endpoint to trigger manual task check (for testing)
@app.post("/api/admin/trigger-task-check", tags=["Admin"])
async def trigger_manual_task_check():
    """Manually trigger task reminder check (for testing)"""
    try:
        await check_upcoming_tasks()
        return {"message": "Task reminder check triggered successfully"}
    except Exception as e:
        logger.error(f"Manual task check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Task check failed: {str(e)}")