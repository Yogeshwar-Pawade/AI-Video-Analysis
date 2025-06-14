from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import asyncio
import logging
from datetime import datetime
import re
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import google.generativeai as genai
import os

from lib.supabase_client import supabase

router = APIRouter()

# Logger
logger = logging.getLogger(__name__)

# Initialize Gemini client
def get_gemini_client():
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise ValueError('Gemini API key is not configured. Please add your API key in the environment variables.')
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.0-flash-001")

# Helper function to clean model outputs
def clean_model_output(text: str) -> str:
    text = re.sub(r'^(Okay|Here\'?s?( is)?|Let me|I will|I\'ll|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly|Alright)[^]*?,\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Here\'?s?( is)?|I\'?ll?|Let me|I will|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly)[^]*?(summary|translate|breakdown|analysis).*?:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Based on|According to).*?,\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^I understand.*?[.!]\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Now|First|Let\'s),?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Here are|The following is|This is|Below is).*?:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(I\'ll provide|Let me break|I\'ll break|I\'ll help|I\'ve structured).*?:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(As requested|Following your|In response to).*?:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^[^:\n🎯🎙️#*\-•]+:\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^(?![#*\-•🎯️])[\s\d]+\.\s*', '', text, flags=re.MULTILINE)
    return text.strip()

# Function to extract audio from video and generate transcript (mock implementation)
async def extract_audio_from_video(video_file: UploadFile) -> str:
    """Extract audio from video and generate transcript"""
    logger.info(f"Starting audio extraction from video file: {video_file.filename}")
    
    try:
        # For this demo, we'll generate a realistic mock transcript
        # In production, you would use services like:
        # - Google Cloud Speech-to-Text
        # - Azure Speech Services  
        # - AWS Transcribe
        # - OpenAI Whisper API
        
        logger.info('Processing video file for transcription')
        
        # Simulate processing time based on file size
        processing_delay = min(2, video_file.size / 1000000) if video_file.size else 1  # Max 2 seconds
        await asyncio.sleep(processing_delay)
        
        # Generate a realistic mock transcript based on file properties
        file_size_mb = round(video_file.size / (1024 * 1024)) if video_file.size else 1
        estimated_duration_minutes = max(1, min(30, file_size_mb / 10))  # Rough estimate
        
        mock_transcript = f"""
Welcome to this video presentation titled "{video_file.filename.replace('.', '_') if video_file.filename else 'video'}".

This is a demonstration of our AI-powered video summarization system. In a real-world scenario, 
this transcript would contain the actual spoken content from your uploaded video file.

The video file you uploaded is approximately {file_size_mb}MB in size, with an estimated duration 
of {round(estimated_duration_minutes)} minutes. Our system has successfully processed the audio 
track and extracted the speech content for analysis.

Key features of our system include:
- Support for multiple video formats (MP4, AVI, MOV, MKV, WebM, WMV, FLV)
- Automatic audio extraction and speech recognition
- AI-powered content summarization using Google's Gemini model
- Real-time processing progress tracking
- Secure file handling with size and duration validation

To implement actual transcription in a production environment, you would integrate with 
professional speech-to-text services such as:

1. Google Cloud Speech-to-Text API - Offers high accuracy with support for multiple languages 
and specialized models for different audio types

2. Azure Cognitive Services Speech - Provides real-time transcription with customizable 
vocabulary and acoustic models

3. AWS Transcribe - Delivers automatic speech recognition with speaker identification 
and custom vocabulary features

4. OpenAI Whisper API - Offers robust multilingual speech recognition with excellent 
accuracy across various audio conditions

The transcript you're reading now demonstrates how the actual spoken content would be 
processed and analyzed by our AI summarization engine to generate comprehensive, 
structured summaries of your video content.

Thank you for testing our video summarization system. The AI will now analyze this 
transcript to create a meaningful summary of the content.
"""
        
        logger.info('Mock transcript generated successfully')
        return mock_transcript.strip()
        
    except Exception as error:
        logger.error(f'Failed to extract audio from video: {str(error)}')
        raise Exception('Failed to process video audio. Please ensure the video file contains audio.')

# Function to create summary prompt for video content
def create_video_summary_prompt(transcript: str, file_name: str) -> str:
    return f"""
You are an expert content summarizer. Create a comprehensive summary of the following video content. Do not include any meta-commentary, introductions, or instructions in your response - provide only the summary content.

**Video File:** {file_name}

**Transcript:**
{transcript}

Format your response exactly as follows:

🎯 **TITLE:** [Create a descriptive title based on the actual content]

📝 **OVERVIEW:**
[Provide a concise overview of what the video is about - 2-3 sentences]

🔑 **KEY POINTS:**
• [First main point discussed in the video]
• [Second main point discussed in the video]
• [Third main point discussed in the video]
• [Continue with additional key points as needed]

💡 **MAIN TAKEAWAYS:**
• [First actionable insight or lesson]
• [Second actionable insight or lesson]
• [Third actionable insight or lesson]
• [Continue with additional takeaways as needed]

🔄 **CONTEXT & IMPLICATIONS:**
[Discuss the broader context, significance, and potential implications of the content discussed in the video]

⏱️ **DURATION:** [Estimated video duration if mentioned or observable]

🏷️ **TAGS:** [Relevant tags or categories for the video content]
"""

async def split_transcript_into_chunks(transcript: str, chunk_size: int = 7000, overlap: int = 1000) -> list:
    words = transcript.split(' ')
    chunks = []
    current_chunk = []
    current_length = 0

    for word in words:
        if current_length + len(word) > chunk_size and len(current_chunk) > 0:
            chunks.append(' '.join(current_chunk))
            overlap_words = current_chunk[-max(1, overlap // 10):]
            current_chunk = overlap_words
            current_length = len(' '.join(overlap_words))
        
        current_chunk.append(word)
        current_length += len(word) + 1  # +1 for space

    if len(current_chunk) > 0:
        chunks.append(' '.join(current_chunk))

    return chunks

@router.post("/process-video")
async def process_video(video: UploadFile = File(...)):
    """Process uploaded video file with streaming response"""
    
    if not video:
        raise HTTPException(status_code=400, detail="No video file provided")

    logger.info(f"Processing video file: {video.filename}, size: {video.size} bytes")

    async def stream_response():
        try:
            # Send initial progress
            yield json.dumps({
                'type': 'progress',
                'message': 'Processing video file...',
                'progress': 10
            }) + '\n'

            # Extract audio and transcribe
            yield json.dumps({
                'type': 'progress',
                'message': 'Extracting audio from video...',
                'progress': 30
            }) + '\n'

            transcript = await extract_audio_from_video(video)

            yield json.dumps({
                'type': 'progress',
                'message': 'Transcription completed, generating summary...',
                'progress': 60
            }) + '\n'

            # Generate summary using Gemini
            model = get_gemini_client()
            chunks = await split_transcript_into_chunks(transcript)
            summary_content = ''

            if len(chunks) == 1:
                prompt = create_video_summary_prompt(transcript, video.filename or "uploaded_video")
                response = model.generate_content(prompt)
                summary_content = clean_model_output(response.text)
            else:
                # Process chunks and combine
                chunk_summaries = []
                for i, chunk in enumerate(chunks):
                    yield json.dumps({
                        'type': 'progress',
                        'message': f'Processing chunk {i+1} of {len(chunks)}...',
                        'progress': 60 + (i * 20 // len(chunks))
                    }) + '\n'
                    
                    prompt = create_video_summary_prompt(chunk, video.filename or "uploaded_video")
                    response = model.generate_content(prompt)
                    chunk_summary = clean_model_output(response.text)
                    chunk_summaries.append(chunk_summary)

                # Final summary combining all chunks
                combined_content = '\n\n'.join(chunk_summaries)
                final_prompt = create_video_summary_prompt(combined_content, video.filename or "uploaded_video")
                response = model.generate_content(final_prompt)
                summary_content = clean_model_output(response.text)

            yield json.dumps({
                'type': 'progress',
                'message': 'Saving summary to database...',
                'progress': 90
            }) + '\n'

            # Generate unique video ID for uploaded file
            video_id = f"upload_{int(time.time() * 1000)}_{video.filename}"
            
            # Save to database
            try:
                if not supabase:
                    raise Exception('Database service not available. Please configure Supabase environment variables.')
                    
                result = supabase.table('summaries').insert({
                    'video_id': video_id,
                    'title': video.filename or 'Uploaded Video',
                    'video_url': f'upload://{video.filename}',
                    'summary': summary_content,
                    'transcript': transcript,
                    'language': 'en',
                    'ai_model': 'gemini-2.0-flash-001',
                    'video_duration': 0,
                    'created_at': datetime.utcnow().isoformat()
                }).execute()

                if result.data:
                    summary_id = result.data[0]['id']
                else:
                    raise Exception('No data returned from database insert')

            except Exception as db_error:
                logger.error(f'Database error: {str(db_error)}')
                raise HTTPException(status_code=500, detail='Failed to save summary to database')

            # Send completion
            yield json.dumps({
                'type': 'complete',
                'message': 'Video processing completed successfully!',
                'progress': 100,
                'summary': summary_content,
                'transcript': transcript,
                'summaryId': summary_id,
                'title': video.filename or 'Uploaded Video',
                'videoId': video_id
            }) + '\n'

        except HTTPException as he:
            yield json.dumps({
                'type': 'error',
                'message': he.detail,
                'progress': 0
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