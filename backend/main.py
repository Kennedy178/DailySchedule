import os
import logging
from fastapi import FastAPI, Depends
from dotenv import load_dotenv

# Import router and verify_token
from backend.routes.tasks import router as tasks_router
from backend.utils.auth_utils import verify_token

#  Set up logging (file + console)
logging.basicConfig(
    level=logging.INFO,  # Change to DEBUG to see detailed logs when needed
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("app.log")   # logs saved only to app.log
    ]
)

logger = logging.getLogger(__name__)

#  Load environment variables
load_dotenv()

#  Initialize FastAPI app
app = FastAPI()

#  Log that the app started
logger.info(" FastAPI application starting...")

#  Include tasks router, protect with verify_token
app.include_router(tasks_router, prefix="/tasks", dependencies=[Depends(verify_token)])

@app.get("/")
async def root():
    logger.info("Root endpoint was called.")
    return {"message": "GetItDone API"}
