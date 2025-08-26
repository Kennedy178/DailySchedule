"""
Contact Form API Endpoint
Handles contact form submissions with honeypot protection and email delivery
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, validator
from typing import Optional
import logging
from datetime import datetime, timedelta
import asyncio
from collections import defaultdict

# Import your email service
try:
    from backend.utils.email_service import EmailService
    EMAIL_SERVICE_AVAILABLE = True
except ImportError as e:
    print(f"Email service import failed: {e}")
    EMAIL_SERVICE_AVAILABLE = False

# get the logger
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/contact", tags=["contact"])

# In-memory rate limiting storage (use Redis in production)
rate_limit_storage = defaultdict(list)
MAX_REQUESTS_PER_HOUR = 5
RATE_LIMIT_WINDOW = timedelta(hours=1)

class ContactFormRequest(BaseModel):
    """Contact form data model with validation"""
    email: str  # Changed from EmailStr to str to avoid validation issues
    subject: str
    message: str
    website: Optional[str] = ""  # Honeypot field
    
    @validator('email')
    def validate_email(cls, v):
        if not v or '@' not in v:
            raise ValueError('Invalid email address')
        return v.lower().strip()
    
    @validator('subject')
    def validate_subject(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError('Subject must be at least 2 characters long')
        if len(v.strip()) > 200:
            raise ValueError('Subject must be less than 200 characters')
        return v.strip()
    
    @validator('message')
    def validate_message(cls, v):
        if not v or len(v.strip()) < 10:
            raise ValueError('Message must be at least 10 characters long')
        if len(v.strip()) > 2000:
            raise ValueError('Message must be less than 2000 characters')
        return v.strip()

class ContactFormResponse(BaseModel):
    """Standard response model"""
    success: bool
    message: str
    timestamp: datetime = datetime.utcnow()

def get_client_ip(request: Request) -> str:
    """Extract client IP address for rate limiting"""
    forwarded_for = request.headers.get('X-Forwarded-For')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.client.host if request.client else 'unknown'

def check_rate_limit(client_ip: str) -> bool:
    """Check if client has exceeded rate limit"""
    now = datetime.utcnow()
    client_requests = rate_limit_storage[client_ip]
    
    # Remove old requests outside the window
    client_requests[:] = [req_time for req_time in client_requests 
                         if now - req_time < RATE_LIMIT_WINDOW]
    
    # Check if under limit
    if len(client_requests) >= MAX_REQUESTS_PER_HOUR:
        return False
    
    # Add current request
    client_requests.append(now)
    return True

def is_honeypot_filled(website_field: Optional[str]) -> bool:
    """Check if honeypot field is filled (indicates bot)"""
    return website_field is not None and website_field.strip() != ""

def sanitize_input(text: str) -> str:
    """Basic input sanitization"""
    if not text:
        return ""
    
    # Remove potential HTML/script tags
    import html
    sanitized = html.escape(text.strip())
    
    # Remove excessive whitespace
    sanitized = ' '.join(sanitized.split())
    
    return sanitized

@router.post("/", response_model=ContactFormResponse)
async def submit_contact_form(
    contact_data: ContactFormRequest,
    request: Request
):
    """
    Handle contact form submission
    
    - Validates input data
    - Checks honeypot for bot detection
    - Applies rate limiting
    - Sends email via email service
    - Returns appropriate response
    """
    
    try:
        # Get client IP for rate limiting
        client_ip = get_client_ip(request)
        
        # Check rate limiting
        if not check_rate_limit(client_ip):
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later."
            )
        
        # Check honeypot (silent failure for bots)
        if is_honeypot_filled(contact_data.website):
            logger.info(f"Honeypot triggered for IP: {client_ip}")
            # Return success to fool bots, but don't send email
            return ContactFormResponse(
                success=True,
                message="Message sent successfully. We'll get back to you soon!"
            )
        
        # Sanitize inputs
        email = contact_data.email.lower().strip()
        subject = sanitize_input(contact_data.subject)
        message = sanitize_input(contact_data.message)
        
        # Additional validation
        if not email or not subject or not message:
            raise HTTPException(
                status_code=400,
                detail="All fields are required."
            )
        
        # Log the attempt (excluding sensitive data)
        logger.info(f"Contact form submission from: {email} (IP: {client_ip})")
        
        # Check if email service is available
        if not EMAIL_SERVICE_AVAILABLE:
            logger.error("Email service not available")
            raise HTTPException(
                status_code=500,
                detail="Email service temporarily unavailable."
            )
        
        # Initialize email service
        email_service = EmailService()
        
        # Send email
        email_sent = await email_service.send_contact_email(
            user_email=email,
            subject=subject,
            message=message,
            client_ip=client_ip
        )
        
        if email_sent:
            logger.info(f"Contact email sent successfully from: {email}")
            return ContactFormResponse(
                success=True,
                message="Thanks, your message has been sent. We'll reply to your email as soon as possible."
            )
        else:
            logger.error(f"Failed to send contact email from: {email}")
            raise HTTPException(
                status_code=500,
                detail="Something went wrong, please try again."
            )
            
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
        
    except ValueError as ve:
        # Validation errors
        logger.warning(f"Validation error: {str(ve)}")
        raise HTTPException(
            status_code=400,
            detail=str(ve)
        )
        
    except Exception as e:
        # Unexpected errors
        logger.error(f"Unexpected error in contact form: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Something went wrong, please try again."
        )

@router.get("/health")
async def health_check():
    """Simple health check endpoint"""
    return {"status": "healthy", "service": "contact"}

# Optional: Endpoint to check rate limit status (for debugging)
@router.get("/rate-limit-status")
async def get_rate_limit_status(request: Request):
    """Get current rate limit status for debugging"""
    client_ip = get_client_ip(request)
    now = datetime.utcnow()
    client_requests = rate_limit_storage[client_ip]
    
    # Clean old requests
    client_requests[:] = [req_time for req_time in client_requests 
                         if now - req_time < RATE_LIMIT_WINDOW]
    
    return {
        "client_ip": client_ip,
        "requests_in_window": len(client_requests),
        "max_requests": MAX_REQUESTS_PER_HOUR,
        "window_minutes": RATE_LIMIT_WINDOW.total_seconds() / 60
    }