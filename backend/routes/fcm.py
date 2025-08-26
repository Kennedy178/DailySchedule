import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from backend.utils.supabase_client import supabase
from backend.utils.auth_utils import verify_token
from backend.utils.fcm_service import cleanup_invalid_tokens

# Set up module-level logger
logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models for FCM operations
class FCMTokenRegister(BaseModel):
    token: str
    device_id: str
    device_name: Optional[str] = None

class FCMTokenResponse(BaseModel):
    id: str
    user_id: str
    token: str
    device_id: str
    device_name: Optional[str]
    created_at: str
    last_used: str
    is_active: bool

class FCMCleanupResponse(BaseModel):
    removed_tokens: int
    message: str

@router.post("/register", response_model=dict)
async def register_fcm_token(
    token_data: FCMTokenRegister, 
    user_id: str = Depends(verify_token)
):
    try:
        if not token_data.token or len(token_data.token) < 50:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid FCM token format"
            )
        if not token_data.device_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Device ID is required"
            )
        
        current_time = datetime.utcnow().isoformat()
        
        try:
            # Check if device already has a token
            existing_device = supabase.table("fcm_tokens").select("*").eq(
                "device_id", token_data.device_id
            ).eq("user_id", user_id).execute()
        except Exception as e:
            logger.error(f"Supabase error checking existing device for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to check existing FCM token"
            )
        
        if existing_device.data:
            # Update existing device token
            update_payload = {
                "token": token_data.token,
                "device_name": token_data.device_name,
                "last_used": current_time,
                "is_active": True
            }
            
            try:
                result = supabase.table("fcm_tokens").update(update_payload).eq(
                    "device_id", token_data.device_id
                ).eq("user_id", user_id).execute()
                
                if not result.data:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to update FCM token"
                    )
                
                logger.info(f"Updated FCM token for user {user_id}, device {token_data.device_id}")
                response = result.data[0]
                
            except Exception as e:
                logger.error(f"Supabase error updating token for user {user_id}: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update FCM token"
                )
            
        else:
            # Check if token already exists with different device
            try:
                existing_token = supabase.table("fcm_tokens").select("*").eq(
                    "token", token_data.token
                ).execute()
            except Exception as e:
                logger.error(f"Supabase error checking existing token for user {user_id}: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to check existing FCM token"
                )
            
            if existing_token.data:
                # Update existing token with new device info
                update_payload = {
                    "user_id": user_id,
                    "device_id": token_data.device_id,
                    "device_name": token_data.device_name,
                    "last_used": current_time,
                    "is_active": True
                }
                
                try:
                    result = supabase.table("fcm_tokens").update(update_payload).eq(
                        "token", token_data.token
                    ).execute()
                    
                    logger.info(f"Updated existing FCM token with new device info for user {user_id}")
                    response = result.data[0]
                    
                except Exception as e:
                    logger.error(f"Supabase error updating existing token for user {user_id}: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to update FCM token"
                    )
                
            else:
                # Insert new token
                insert_payload = {
                    "user_id": user_id,
                    "token": token_data.token,
                    "device_id": token_data.device_id,
                    "device_name": token_data.device_name,
                    "created_at": current_time,
                    "last_used": current_time,
                    "is_active": True
                }
                
                try:
                    result = supabase.table("fcm_tokens").insert(insert_payload).execute()
                    
                    if not result.data or not result.data[0].get("id"):
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to register FCM token: No ID returned"
                        )
                    
                    logger.info(f"Registered new FCM token for user {user_id}, device {token_data.device_id}")
                    response = result.data[0]
                    
                except Exception as e:
                    logger.error(f"Supabase error inserting token for user {user_id}: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to register FCM token"
                    )
        
        # Convert IDs to strings for JSON serialization
        response["id"] = str(response["id"])
        response["user_id"] = str(response["user_id"])
        
        return {
            "message": "FCM token registered successfully",
            "token_info": response
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"FCM token registration failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register FCM token: {str(e)}"
        )
    
@router.delete("/unregister", response_model=dict)
async def unregister_fcm_token(
    token_data: FCMTokenRegister,
    user_id: str = Depends(verify_token)
):
    """
    Unregister (deactivate) an FCM token for the authenticated user.
    Can unregister by device_id or token.
    """
    try:
        if not token_data.device_id and not token_data.token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either device_id or token must be provided"
            )
        
        # Build query based on provided data
        query = supabase.table("fcm_tokens").update({"is_active": False}).eq("user_id", user_id)
        
        if token_data.device_id:
            query = query.eq("device_id", token_data.device_id)
        elif token_data.token:
            query = query.eq("token", token_data.token)
        
        result = query.execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="FCM token not found for this user"
            )
        
        identifier = token_data.device_id or token_data.token[:20] + "..."
        logger.info(f"Deactivated FCM token for user {user_id}, identifier: {identifier}")
        
        return {
            "message": "FCM token unregistered successfully",
            "deactivated_tokens": len(result.data)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"FCM token unregistration failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unregister FCM token: {str(e)}"
        )

@router.get("/tokens", response_model=List[FCMTokenResponse])
async def get_user_fcm_tokens(user_id: str = Depends(verify_token)):
    """
    Get all active FCM tokens for the authenticated user.
    Useful for admin/debugging purposes.
    """
    try:
        result = supabase.table("fcm_tokens").select("*").eq("user_id", user_id).eq("is_active", True).execute()
        
        tokens = []
        for token_record in result.data:
            # Convert UUIDs to strings and ensure proper format
            token_response = {
                "id": str(token_record["id"]),
                "user_id": str(token_record["user_id"]),
                "token": token_record["token"],
                "device_id": token_record["device_id"],
                "device_name": token_record.get("device_name"),
                "created_at": token_record["created_at"],
                "last_used": token_record["last_used"],
                "is_active": token_record["is_active"]
            }
            tokens.append(token_response)
        
        logger.info(f"Retrieved {len(tokens)} active FCM tokens for user {user_id}")
        return tokens
        
    except Exception as e:
        logger.error(f"Failed to retrieve FCM tokens for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve FCM tokens: {str(e)}"
        )

@router.post("/cleanup", response_model=FCMCleanupResponse)
async def cleanup_fcm_tokens(user_id: str = Depends(verify_token)):
    """
    Clean up inactive FCM tokens from the database.
    Only removes tokens belonging to the authenticated user.
    """
    try:
        # First, get count of inactive tokens for this user
        inactive_tokens = supabase.table("fcm_tokens").select("id").eq("user_id", user_id).eq("is_active", False).execute()
        
        if not inactive_tokens.data:
            return FCMCleanupResponse(
                removed_tokens=0,
                message="No inactive tokens found for cleanup"
            )
        
        # Delete inactive tokens for this user
        delete_result = supabase.table("fcm_tokens").delete().eq("user_id", user_id).eq("is_active", False).execute()
        
        removed_count = len(delete_result.data) if delete_result.data else 0
        
        logger.info(f"Cleaned up {removed_count} inactive FCM tokens for user {user_id}")
        
        return FCMCleanupResponse(
            removed_tokens=removed_count,
            message=f"Successfully removed {removed_count} inactive tokens"
        )
        
    except Exception as e:
        logger.error(f"FCM token cleanup failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cleanup FCM tokens: {str(e)}"
        )

@router.post("/test", response_model=dict)
async def test_fcm_notification(user_id: str = Depends(verify_token)):
    """
    Send a test FCM notification to the authenticated user.
    Useful for testing FCM setup.
    """
    try:
        from backend.utils.fcm_service import send_notification_to_user
        
        title = "Test Notification"
        body = "This is a test notification from GetItDone!"
        data = {
            "type": "test",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        results = await send_notification_to_user(user_id, title, body, data)
        
        if results["sent"] > 0:
            logger.info(f"Test FCM notification sent to user {user_id}: {results}")
            return {
                "message": "Test notification sent successfully",
                "results": results
            }
        else:
            logger.warning(f"Test FCM notification failed for user {user_id}: {results}")
            return {
                "message": "Failed to send test notification - no active tokens or send failed",
                "results": results
            }
        
    except Exception as e:
        logger.error(f"Test FCM notification failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send test notification: {str(e)}"
        )