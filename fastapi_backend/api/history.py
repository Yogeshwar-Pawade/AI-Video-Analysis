from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from lib.supabase_client import supabase, extract_title_from_content

router = APIRouter()

# Logger
logger = logging.getLogger(__name__)

class SummaryItem(BaseModel):
    id: str
    videoId: str
    title: str
    content: str
    transcript: Optional[str] = None
    language: str
    mode: str
    source: str
    createdAt: str
    updatedAt: Optional[str] = None

class HistoryResponse(BaseModel):
    summaries: List[SummaryItem]

@router.get("/history", response_model=HistoryResponse)
async def get_summaries_history():
    """Get all summaries from the database"""
    
    try:
        if not supabase:
            raise HTTPException(
                status_code=503,
                detail={"error": "Database service not available. Please configure Supabase environment variables."}
            )
            
        result = supabase.table('summaries').select('*').order('created_at', desc=True).execute()
        
        if result.data is None:
            logger.error('Failed to fetch summaries from database')
            raise HTTPException(
                status_code=500,
                detail={"error": "Failed to fetch summaries"}
            )

        processed_summaries = []
        for summary in result.data:
            # Process each summary to match the expected format
            processed_summary = SummaryItem(
                id=summary.get('id', ''),
                videoId=summary.get('video_id', ''),
                title=summary.get('title', extract_title_from_content(summary.get('summary', ''))),
                content=summary.get('summary', ''),  # Map summary to content for compatibility
                transcript=summary.get('transcript'),
                language=summary.get('language', 'en'),
                mode='video' if summary.get('video_url', '').startswith('s3://') else 'youtube',  # Infer mode from URL
                source='upload' if summary.get('video_url', '').startswith('s3://') else 'youtube',  # Infer source from URL
                createdAt=summary.get('created_at', ''),
                updatedAt=summary.get('updated_at')
            )
            processed_summaries.append(processed_summary)

        return HistoryResponse(summaries=processed_summaries)
        
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f'Error fetching summaries: {str(error)}')
        raise HTTPException(
            status_code=500,
            detail={"error": "Failed to fetch summaries"}
        ) 