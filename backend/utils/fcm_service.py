import logging
import os
import json
import time
import asyncio  
from typing import List, Dict, Optional
from firebase_admin import initialize_app, messaging, credentials
from firebase_admin.exceptions import FirebaseError
from backend.utils.supabase_client import supabase

# Set up module-level logger
logger = logging.getLogger(__name__)

# Firebase Admin SDK initialization
_firebase_app = None

def initialize_firebase():
    """
    Initialize Firebase Admin SDK with service account credentials.
    Should be called once at app startup.
    """
    global _firebase_app
    
    if _firebase_app is not None:
        logger.info("Firebase Admin SDK already initialized")
        return _firebase_app
    
    try:
        # Get service account from environment variable (JSON string)
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT")
        if not service_account_json:
            raise ValueError("FIREBASE_SERVICE_ACCOUNT environment variable is missing")
        
        # Parse JSON from environment variable
        service_account_dict = json.loads(service_account_json)
        
        # Initialize Firebase Admin SDK
        cred = credentials.Certificate(service_account_dict)
        _firebase_app = initialize_app(cred)
        
        logger.info("Firebase Admin SDK initialized successfully")
        return _firebase_app
        
    except Exception as e:
        logger.error(f"Failed to initialize Firebase Admin SDK: {str(e)}")
        raise

def get_firebase_app():
    """Get the Firebase app instance, initializing if necessary."""
    if _firebase_app is None:
        return initialize_firebase()
    return _firebase_app

async def send_notification_to_token(
    token: str, 
    title: str, 
    body: str, 
    data: Optional[Dict[str, str]] = None
) -> bool:
    """
    Send a push notification to a single FCM token.
    
    Args:
        token: FCM registration token
        title: Notification title
        body: Notification body text
        data: Optional data payload
    
    Returns:
        bool: True if sent successfully, False otherwise
    """
    try:
        # Ensure Firebase is initialized
        get_firebase_app()
        
        # CRITICAL: Send data-only payload to prevent browser auto-notifications
        message_data = data or {}
        message_data.update({
            "title": title,
            "body": body,
            "tag": f"task-{int(time.time())}"
        })
        
        # Create message with ONLY data payload (no notification block)
        message = messaging.Message(
            data=message_data,  # Only data, no notification block
            token=token
        )
        
        # Send message
        response = messaging.send(message)
        logger.info(f"FCM notification sent successfully to token {token[:20]}... Response: {response}")
        return True
        
    except messaging.UnregisteredError:
        logger.warning(f"FCM token is unregistered: {token[:20]}...")
        await mark_token_as_invalid(token)
        return False
        
    except messaging.SenderIdMismatchError:
        logger.error(f"FCM sender ID mismatch for token: {token[:20]}...")
        await mark_token_as_invalid(token)
        return False
        
    except FirebaseError as e:
        logger.error(f"FCM send failed for token {token[:20]}...: {str(e)}")
        return False
        
    except Exception as e:
        logger.error(f"Unexpected error sending FCM to token {token[:20]}...: {str(e)}")
        return False

async def send_notification_to_user(
    user_id: str, 
    title: str, 
    body: str, 
    data: Optional[Dict[str, str]] = None,
    max_retries: int = 3
) -> Dict[str, int]:
    """
    Send push notification to all active tokens for a user.
    
    Args:
        user_id: User ID to send notification to
        title: Notification title
        body: Notification body text
        data: Optional data payload
        max_retries: Maximum retry attempts for failed sends
    
    Returns:
        Dict with success/failure counts: {"sent": 2, "failed": 1, "invalid_tokens": 1}
    """
    try:
        # Get all active FCM tokens for user
        try:
            tokens_response = supabase.table("fcm_tokens").select("*").eq("user_id", user_id).eq("is_active", True).execute()
        except Exception as e:
            logger.error(f"Supabase error fetching tokens for user {user_id}: {str(e)}")
            return {"sent": 0, "failed": 0, "invalid_tokens": 0}
        
        # Check if no tokens found
        if not tokens_response.data:
            logger.info(f"No active FCM tokens found for user {user_id}")
            return {"sent": 0, "failed": 0, "invalid_tokens": 0}
        
        results = {"sent": 0, "failed": 0, "invalid_tokens": 0}
        
        # Send to each token with retry logic
        for token_record in tokens_response.data:
            token = token_record["token"]
            device_id = token_record["device_id"]
            
            success = False
            for attempt in range(max_retries):
                if await send_notification_to_token(token, title, body, data):
                    results["sent"] += 1
                    success = True
                    
                    # Update last_used timestamp
                    await update_token_last_used(device_id)
                    break
                else:
                    if attempt < max_retries - 1:
                        # Exponential backoff: 1s, 2s, 4s
                        wait_time = 2 ** attempt
                        logger.info(f"Retrying FCM send to {device_id} in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(wait_time)  # Non-blocking sleep
            
            if not success:
                results["failed"] += 1
                logger.error(f"Failed to send FCM notification to device {device_id} after {max_retries} attempts")
        
        logger.info(f"FCM batch send to user {user_id} completed: {results}")
        return results
        
    except Exception as e:
        logger.error(f"Error sending notifications to user {user_id}: {str(e)}")
        return {"sent": 0, "failed": 0, "invalid_tokens": 0}

async def send_batch_notifications(notifications: List[Dict]) -> Dict[str, int]:
    """
    Send multiple notifications efficiently.
    
    Args:
        notifications: List of notification dicts with keys: user_id, title, body, data
    
    Returns:
        Dict with total success/failure counts
    """
    total_results = {"sent": 0, "failed": 0, "invalid_tokens": 0}
    
    try:
        for notification in notifications:
            user_id = notification.get("user_id")
            title = notification.get("title")
            body = notification.get("body")
            data = notification.get("data")
            
            if not all([user_id, title, body]):
                logger.warning(f"Skipping invalid notification: {notification}")
                total_results["failed"] += 1
                continue
            
            results = await send_notification_to_user(user_id, title, body, data)
            
            # Aggregate results
            total_results["sent"] += results["sent"]
            total_results["failed"] += results["failed"]
            total_results["invalid_tokens"] += results["invalid_tokens"]
        
        logger.info(f"Batch FCM send completed: {total_results}")
        return total_results
        
    except Exception as e:
        logger.error(f"Error in batch FCM send: {str(e)}")
        return total_results

async def mark_token_as_invalid(token: str):
    """Mark an FCM token as inactive due to being invalid/unregistered."""
    try:
        supabase.table("fcm_tokens").update({"is_active": False}).eq("token", token).execute()
        logger.info(f"Marked FCM token as inactive: {token[:20]}...")
    except Exception as e:
        logger.error(f"Failed to mark token as inactive: {str(e)}")

async def update_token_last_used(device_id: str):
    """Update the last_used timestamp for an FCM token."""
    try:
        from datetime import datetime
        supabase.table("fcm_tokens").update({
            "last_used": datetime.utcnow().isoformat()
        }).eq("device_id", device_id).execute()
    except Exception as e:
        logger.error(f"Failed to update token last_used for device {device_id}: {str(e)}")

async def cleanup_invalid_tokens() -> int:
    """
    Remove inactive FCM tokens from database.
    
    Returns:
        int: Number of tokens cleaned up
    """
    try:
        # Delete inactive tokens
        result = supabase.table("fcm_tokens").delete().eq("is_active", False).execute()
        
        count = len(result.data) if result.data else 0
        logger.info(f"Cleaned up {count} inactive FCM tokens")
        return count
        
    except Exception as e:
        logger.error(f"Error cleaning up invalid tokens: {str(e)}")
        return 0

# Task notification helper function
async def send_task_reminder(user_id: str, task_name: str, priority: str, user_name: str = "you") -> bool:
    """
    Send a task reminder notification to a user.
    
    Args:
        user_id: User ID to send to
        task_name: Name of the task
        priority: Task priority
        user_name: User's display name
    
    Returns:
        bool: True if sent to at least one device
    """
    title = "Task Reminder"
    body = f"Hey, {user_name}! {task_name} is starting in 10 minutes—let's do this!😊💪 Priority: {priority}"
    
    data = {
        "type": "task_reminder",
        "task_name": task_name,
        "priority": priority,
        "user_name": user_name
    }
    
    results = await send_notification_to_user(user_id, title, body, data)
    return results["sent"] > 0