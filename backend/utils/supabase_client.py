import logging
from supabase import create_client, Client
from dotenv import load_dotenv
import os

# Set up logger for this module
logger = logging.getLogger(__name__)

# Load .env explicitly (works no matter where FastAPI is run from)
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")

if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
    logger.info(f".env file loaded from {env_path}")
else:
    logger.info(".env file not found — relying on system environment variables.")

# Read environment variables (from .env in development or hosting env vars in production)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Fail fast if critical values are missing
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_KEY is missing. Check your .env or hosting environment variables.")

# Basic info log 
key_type = "service_role" if SUPABASE_KEY.startswith("eyJ") else "anon/public"
logger.info(f"Supabase client initialized. URL: {SUPABASE_URL} | Key type: {key_type}")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
