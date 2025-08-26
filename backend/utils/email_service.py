"""
Email Service for GetItDone Contact Form
Handles email sending via Gmail SMTP with proper From/Reply-To configuration
"""

import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from datetime import datetime
import os
import logging
from typing import Optional
import asyncio
from functools import wraps

# get the logger
logger = logging.getLogger(__name__)

def async_retry(max_retries: int = 3, delay: float = 1.0):
    """Decorator for async retry logic"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        logger.warning(f"Attempt {attempt + 1} failed: {str(e)}. Retrying...")
                        await asyncio.sleep(delay * (attempt + 1))
                    else:
                        logger.error(f"All {max_retries} attempts failed: {str(e)}")
            raise last_exception
        return wrapper
    return decorator

class EmailService:
    """Email service for sending contact form emails via Gmail SMTP"""
    
    def __init__(self):
        """Initialize email service with Gmail SMTP configuration"""
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 465  # SSL port
        self.gmail_address = os.getenv('GMAIL_ADDRESS')
        self.gmail_app_password = os.getenv('GMAIL_APP_PASSWORD')
        
        # Validate configuration
        if not self.gmail_address or not self.gmail_app_password:
            raise ValueError(
                "Gmail configuration missing. Please set GMAIL_ADDRESS and "
                "GMAIL_APP_PASSWORD in your .env file."
            )
        
        logger.info(f"Email service initialized for: {self.gmail_address}")
    
    def create_contact_email(
        self, 
        user_email: str, 
        subject: str, 
        message: str,
        client_ip: str
    ) -> MIMEMultipart:
        """Create a properly formatted contact form email"""
        
        # Create message container
        msg = MIMEMultipart('alternative')
        
        # Email headers
        msg['From'] = formataddr(('GetItDone Contact Form', self.gmail_address))
        msg['To'] = self.gmail_address
        msg['Reply-To'] = user_email  # This allows easy replies
        msg['Subject'] = f"[GetItDone Contact] {subject}"
        
        # Create HTML and plain text versions
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        
        # Plain text version
        text_content = f"""
New Contact Form Submission - GetItDone

From: {user_email}
Subject: {subject}
Submitted: {timestamp}
IP Address: {client_ip}

Message:
{message}

---
This message was sent via the GetItDone contact form.
Reply directly to this email to respond to the user.
        """.strip()
        
        # HTML version
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .header {{ background: #4A90E2; color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
        .content {{ padding: 20px; background: #f9f9f9; }}
        .message-box {{ background: white; padding: 15px; border-left: 4px solid #4A90E2; margin: 15px 0; }}
        .footer {{ padding: 15px; font-size: 12px; color: #666; border-top: 1px solid #ddd; }}
        .info-table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        .info-table td {{ padding: 8px; border-bottom: 1px solid #eee; }}
        .info-table .label {{ font-weight: bold; width: 120px; color: #555; }}
    </style>
</head>
<body>
    <div class="header">
        <h2>🚀 New Contact Form Submission - GetItDone</h2>
    </div>
    
    <div class="content">
        <table class="info-table">
            <tr>
                <td class="label">From:</td>
                <td><strong>{user_email}</strong></td>
            </tr>
            <tr>
                <td class="label">Subject:</td>
                <td>{subject}</td>
            </tr>
            <tr>
                <td class="label">Submitted:</td>
                <td>{timestamp}</td>
            </tr>
            <tr>
                <td class="label">IP Address:</td>
                <td>{client_ip}</td>
            </tr>
        </table>
        
        <h3>Message:</h3>
        <div class="message-box">
            {message.replace(chr(10), '<br>')}
        </div>
    </div>
    
    <div class="footer">
        <p>This message was sent via the GetItDone contact form.</p>
        <p><strong>Reply directly to this email to respond to the user.</strong></p>
    </div>
</body>
</html>
        """.strip()
        
        # Attach both versions
        part1 = MIMEText(text_content, 'plain')
        part2 = MIMEText(html_content, 'html')
        
        msg.attach(part1)
        msg.attach(part2)
        
        return msg
    
    @async_retry(max_retries=3, delay=1.0)
    async def send_contact_email(
        self, 
        user_email: str, 
        subject: str, 
        message: str,
        client_ip: str = 'unknown'
    ) -> bool:
        """
        Send contact form email asynchronously
        
        Args:
            user_email: Email address of the person contacting
            subject: Subject line from the form
            message: Message content from the form
            client_ip: IP address of the sender
            
        Returns:
            bool: True if email was sent successfully, False otherwise
        """
        
        try:
            # Create email message
            email_msg = self.create_contact_email(user_email, subject, message, client_ip)
            
            # Send email in executor to avoid blocking
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(
                None, 
                self._send_email_sync, 
                email_msg
            )
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to send contact email: {str(e)}")
            return False
    
    def _send_email_sync(self, email_msg: MIMEMultipart) -> bool:
        """Synchronous email sending (runs in executor)"""
        
        try:
            # Create SSL context
            context = ssl.create_default_context()
            
            # Connect to Gmail SMTP server
            with smtplib.SMTP_SSL(self.smtp_server, self.smtp_port, context=context) as server:
                # Login
                server.login(self.gmail_address, self.gmail_app_password)
                
                # Send email
                text = email_msg.as_string()
                server.sendmail(self.gmail_address, [self.gmail_address], text)
                
                logger.info("Contact email sent successfully")
                return True
                
        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"Gmail SMTP authentication failed: {str(e)}")
            logger.error("Please check your GMAIL_ADDRESS and GMAIL_APP_PASSWORD")
            return False
            
        except smtplib.SMTPRecipientsRefused as e:
            logger.error(f"Recipient refused: {str(e)}")
            return False
            
        except smtplib.SMTPServerDisconnected as e:
            logger.error(f"SMTP server disconnected: {str(e)}")
            return False
            
        except Exception as e:
            logger.error(f"Unexpected error sending email: {str(e)}")
            return False
    
    async def test_connection(self) -> bool:
        """Test Gmail SMTP connection and authentication"""
        
        try:
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(None, self._test_connection_sync)
            return success
            
        except Exception as e:
            logger.error(f"Connection test failed: {str(e)}")
            return False
    
    def _test_connection_sync(self) -> bool:
        """Test SMTP connection synchronously"""
        
        try:
            context = ssl.create_default_context()
            
            with smtplib.SMTP_SSL(self.smtp_server, self.smtp_port, context=context) as server:
                server.login(self.gmail_address, self.gmail_app_password)
                logger.info("Gmail SMTP connection test successful")
                return True
                
        except Exception as e:
            logger.error(f"Gmail SMTP connection test failed: {str(e)}")
            return False

# Optional: Create a test function
async def test_email_service():
    """Test function for the email service"""
    service = EmailService()
    
    # Test connection
    connection_ok = await service.test_connection()
    print(f"Connection test: {'✅ PASSED' if connection_ok else '❌ FAILED'}")
    
    if connection_ok:
        # Test sending email
        test_sent = await service.send_contact_email(
            user_email="test@example.com",
            subject="Test Contact Form",
            message="This is a test message from the GetItDone contact form.",
            client_ip="127.0.0.1"
        )
        print(f"Email send test: {'✅ PASSED' if test_sent else '❌ FAILED'}")

# Run test if this file is executed directly
if __name__ == "__main__":
    asyncio.run(test_email_service())