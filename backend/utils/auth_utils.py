import logging
import os
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Load Supabase JWT secret
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# Security dependency
security = HTTPBearer()

# Set up module-level logger
logger = logging.getLogger(__name__)

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify the JWT token from the Authorization header.
    Logs decoded payload and any errors to app.log.
    """
    try:
        token = credentials.credentials
        decoded = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )

        # Log decoded payload instead of printing
        logger.info(f"JWT verified for user_id={decoded.get('sub')}, payload={decoded}")

        if decoded.get("sub") is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no user_id"
            )

        return decoded["sub"]  # Return user_id for route use

    except jwt.ExpiredSignatureError:
        logger.warning("JWT verification failed: token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )

    except jwt.InvalidTokenError as e:
        logger.error(f"JWT verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
