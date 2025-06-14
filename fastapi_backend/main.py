from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import os
import json
import asyncio
import logging
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import our custom modules
from api.summarize import router as summarize_router
from api.process_video import router as process_video_router
from api.process_s3_video import router as process_s3_video_router
from api.upload import router as upload_router  
from api.history import router as history_router
from api.chat_router import router as chat_router


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Video Summarizer API",
    description="FastAPI backend for YouTube video and direct video file summarization",
    version="1.0.0"
)

# CORS configuration - load from cors-config.json if available
try:
    with open("cors-config.json", "r") as f:
        cors_config = json.load(f)
        allowed_origins = cors_config.get("allowed_origins", ["*"])
except FileNotFoundError:
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(summarize_router, prefix="/api")
app.include_router(process_video_router, prefix="/api")
app.include_router(process_s3_video_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(chat_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Video Summarizer FastAPI Backend", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True
    ) 