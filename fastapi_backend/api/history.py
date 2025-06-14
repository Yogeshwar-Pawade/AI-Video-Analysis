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

class DeleteResponse(BaseModel):
    success: bool
    message: str

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

@router.delete("/history/{summary_id}", response_model=DeleteResponse)
async def delete_summary(summary_id: str):
    """Delete a summary and all its associated conversations and messages"""
    
    try:
        if not supabase:
            raise HTTPException(
                status_code=503,
                detail={"error": "Database service not available. Please configure Supabase environment variables."}
            )
        
        # First, verify the summary exists
        summary_result = supabase.table('summaries').select('*').eq('id', summary_id).execute()
        if not summary_result.data:
            raise HTTPException(
                status_code=404,
                detail={"error": "Summary not found"}
            )
        
        # Get all conversations for this summary
        conversations_result = supabase.table('chat_conversations').select('id').eq('summary_id', summary_id).execute()
        conversation_ids = [conv['id'] for conv in conversations_result.data] if conversations_result.data else []
        
        # Delete all messages for these conversations (if any)
        if conversation_ids:
            for conv_id in conversation_ids:
                messages_delete = supabase.table('chat_messages').delete().eq('conversation_id', conv_id).execute()
                logger.info(f"Deleted messages for conversation {conv_id}")
        
        # Delete all conversations for this summary
        if conversation_ids:
            conversations_delete = supabase.table('chat_conversations').delete().eq('summary_id', summary_id).execute()
            logger.info(f"Deleted {len(conversation_ids)} conversations for summary {summary_id}")
        
        # Finally, delete the summary itself
        summary_delete = supabase.table('summaries').delete().eq('id', summary_id).execute()
        
        if not summary_delete.data:
            raise HTTPException(
                status_code=500,
                detail={"error": "Failed to delete summary"}
            )
        
        logger.info(f"Successfully deleted summary {summary_id} and all associated data")
        return DeleteResponse(
            success=True,
            message="Summary and all associated conversations deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f'Error deleting summary {summary_id}: {str(error)}')
        raise HTTPException(
            status_code=500,
            detail={"error": f"Failed to delete summary: {str(error)}"}
        ) 