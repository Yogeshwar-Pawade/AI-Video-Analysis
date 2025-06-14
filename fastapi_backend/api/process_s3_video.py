from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import asyncio
import logging
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from lib.supabase_client import supabase
from lib.aws_s3 import s3_downloader
from lib.google_files import google_files_processor, VideoProcessingResult

router = APIRouter()

# Logger
logger = logging.getLogger(__name__)

class ProcessS3VideoRequest(BaseModel):
    s3Key: str
    fileName: str

# Process video using S3 → Google Files API → Gemini workflow
async def process_video_from_s3(s3_key: str, file_name: str) -> VideoProcessingResult:
    try:
        logger.info(f"Starting S3 → Google Files → Gemini workflow for: {file_name} (S3 key: {s3_key})")
        
        # Step 1: Download video from S3
        logger.info('Step 1: Downloading from S3...')
        download_result = await s3_downloader.download_file(s3_key)
        
        logger.info(f"Downloaded {download_result['contentLength']} bytes from S3", {
            'contentType': download_result['contentType'],
            'size': download_result['contentLength']
        })
        
        # Step 2: Process with Google Files API + Gemini
        logger.info('Step 2: Processing with Google Files API + Gemini...')
        result = await google_files_processor.process_video(
            download_result['buffer'],
            file_name,
            download_result['contentType']
        )
        
        logger.info('Video processing completed successfully')
        return result
        
    except Exception as error:
        logger.error(f'S3 → Google Files → Gemini workflow failed: {str(error)}')
        raise Exception(f"Video processing failed: {str(error)}")

@router.post("/process-s3-video")
async def process_s3_video(request: ProcessS3VideoRequest):
    """Process S3 video with streaming response"""
    
    if not request.s3Key or not request.fileName:
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: s3Key, fileName"
        )

    logger.info(f"Processing S3 video: {request.s3Key}, fileName: {request.fileName}")

    async def stream_response():
        try:
            yield json.dumps({
                'type': 'progress',
                'message': 'Downloading video from S3...',
                'progress': 10
            }) + '\n'

            # Step 1: Download from S3
            download_result = await s3_downloader.download_file(request.s3Key)
            
            yield json.dumps({
                'type': 'progress',
                'message': 'Uploading to Google Files API...',
                'progress': 30
            }) + '\n'

            # Step 2: Upload to Google Files API
            upload_result = await google_files_processor.upload_to_google_files(
                download_result['buffer'],
                request.fileName,
                download_result['contentType']
            )

            yield json.dumps({
                'type': 'progress',
                'message': 'Waiting for Google Files processing...',
                'progress': 50
            }) + '\n'

            # Step 3: Wait for Google processing
            await google_files_processor.wait_for_file_processing(upload_result.name)

            yield json.dumps({
                'type': 'progress',
                'message': 'Generating transcript and summary with Gemini...',
                'progress': 70
            }) + '\n'

            # Step 4: Process with Gemini
            result = await google_files_processor.process_video_with_gemini(
                upload_result.file_uri,
                upload_result.name,
                download_result['contentType']
            )

            yield json.dumps({
                'type': 'progress',
                'message': 'Cleaning up Google Files...',
                'progress': 85
            }) + '\n'

            # Step 5: Cleanup Google Files
            await google_files_processor.delete_google_file(upload_result.name)

            yield json.dumps({
                'type': 'progress',
                'message': 'Saving to database...',
                'progress': 90
            }) + '\n'

            # Step 6: Save to database
            try:
                if not supabase:
                    raise Exception('Database service not available. Please configure Supabase environment variables.')
                    
                db_result = supabase.table('summaries').insert({
                    'video_id': request.s3Key,
                    'title': request.fileName,
                    'video_url': f's3://{request.s3Key}',
                    'summary': result.summary,
                    'transcript': result.transcript,
                    'language': 'en',
                    'ai_model': 'gemini-2.0-flash-001',
                    'video_duration': result.duration or 0,
                    'created_at': datetime.utcnow().isoformat()
                }).execute()

                if not db_result.data:
                    raise Exception('No data returned from database insert')

                summary_data = db_result.data[0]

            except Exception as db_error:
                logger.error(f'Database error: {str(db_error)}')
                raise Exception('Failed to save summary to database')

            yield json.dumps({
                'type': 'complete',
                'message': 'Video processing completed successfully!',
                'progress': 100,
                'summary': result.summary,
                'transcript': result.transcript,
                'summaryId': summary_data['id'],
                'title': request.fileName,
                's3Key': request.s3Key
            }) + '\n'

        except Exception as error:
            logger.error(f'Video processing failed: {str(error)}')
            yield json.dumps({
                'type': 'error',
                'message': str(error) if str(error) else 'Failed to process video',
                'progress': 0
            }) + '\n'

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    ) 