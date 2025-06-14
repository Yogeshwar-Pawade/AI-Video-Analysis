from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import asyncio
import logging
from datetime import datetime
import re
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import youtube-transcript-api equivalent
try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:
    YouTubeTranscriptApi = None

import google.generativeai as genai
import os
import tempfile
import subprocess
from io import BytesIO

from lib.supabase_client import supabase
from lib.youtube_utils import extract_video_id, create_summary_prompt

router = APIRouter()

# Logger
logger = logging.getLogger(__name__)

class SummarizeRequest(BaseModel):
    url: str
    language: str = "en"

class SummarizeResponse(BaseModel):
    gemini: bool

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
    
    # German prefixes
    text = re.sub(r'^(Okay|Hier( ist)?|Lass mich|Ich werde|Ich kann|Ich würde|Ich möchte|Erlauben Sie mir|Sicher|Natürlich|Gewiss|In Ordnung)[^]*?,\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Hier( ist)?|Ich werde|Lass mich|Ich kann|Ich würde|Ich möchte)[^]*?(Zusammenfassung|Übersetzung|Analyse).*?:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Basierend auf|Laut|Gemäß).*?,\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^Ich verstehe.*?[.!]\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Jetzt|Zunächst|Lass uns),?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Hier sind|Folgendes|Dies ist|Im Folgenden).*?:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Ich werde|Lass mich|Ich helfe|Ich habe strukturiert).*?:\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(Wie gewünscht|Entsprechend Ihrer|Als Antwort auf).*?:\s*', '', text, flags=re.IGNORECASE)
    
    # Remove meta instructions while preserving markdown
    text = re.sub(r'^[^:\n🎯🎙️#*\-•]+:\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^(?![#*\-•🎯️])[\s\d]+\.\s*', '', text, flags=re.MULTILINE)
    
    return text.strip()

async def split_transcript_into_chunks(transcript: str, chunk_size: int = 7000, overlap: int = 1000) -> list:
    words = transcript.split(' ')
    chunks = []
    current_chunk = []
    current_length = 0

    for word in words:
        if current_length + len(word) > chunk_size and len(current_chunk) > 0:
            chunks.append(' '.join(current_chunk))
            # Keep last few words for overlap
            overlap_words = current_chunk[-max(1, overlap // 10):]
            current_chunk = overlap_words
            current_length = len(' '.join(overlap_words))
        
        current_chunk.append(word)
        current_length += len(word) + 1  # +1 for space

    if len(current_chunk) > 0:
        chunks.append(' '.join(current_chunk))

    return chunks

async def get_transcript(video_id: str) -> Dict[str, Any]:
    """Get transcript from YouTube video"""
    logger.info(f"Attempting to fetch YouTube transcript for video {video_id}")
    
    if not YouTubeTranscriptApi:
        raise HTTPException(status_code=500, detail="YouTube transcript functionality not available. Please install youtube-transcript-api")
    
    try:
        # Try fetching transcript with different language options
        languages = ['en', 'en-US', 'en-GB', None]  # None lets the library auto-detect
        transcript_list = None
        last_error = None

        for lang in languages:
            try:
                logger.info(f"Trying to fetch transcript with language: {lang or 'auto-detect'}")
                
                if lang:
                    transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang])
                else:
                    transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
                
                if transcript_list and len(transcript_list) > 0:
                    logger.info(f"Successfully fetched transcript with language: {lang or 'auto-detect'}")
                    break
            except Exception as error:
                last_error = error
                logger.info(f"Failed to fetch transcript with language {lang or 'auto-detect'}: {str(error)}")
                continue

        # If we still don't have a transcript, throw the last error
        if not transcript_list or len(transcript_list) == 0:
            raise last_error or Exception('No transcript found after trying all language options')

        # Process the transcript
        transcript_text = ' '.join([item['text'] for item in transcript_list]).strip()
        
        logger.info('Raw transcript fetched', {
            'itemCount': len(transcript_list),
            'textLength': len(transcript_text),
            'firstItems': [item['text'] for item in transcript_list[:3]]
        })
        
        # Check if the transcript text is meaningful
        if not transcript_text or len(transcript_text) < 50:
            raise Exception(f"Transcript too short: only {len(transcript_text)} characters")

        # Extract title from transcript - try to get a meaningful title
        title = 'YouTube Video Summary'
        try:
            first_few_lines = ' '.join([item['text'] for item in transcript_list[:10]])
            sentences = re.split(r'[.!?]+', first_few_lines)
            
            for sentence in sentences:
                clean_sentence = sentence.strip()
                if 20 < len(clean_sentence) < 100:
                    title = clean_sentence
                    break
        except Exception as title_error:
            logger.info('Could not extract title from transcript, using default')

        logger.info('Successfully processed YouTube transcript', {
            'title': title,
            'itemsCount': len(transcript_list),
            'transcriptLength': len(transcript_text),
            'firstChars': transcript_text[:100]
        })

        return {
            'transcript': transcript_text,
            'source': 'youtube',
            'title': title
        }
        
    except Exception as error:
        # Enhanced error logging
        error_details = {
            'name': type(error).__name__,
            'message': str(error),
            'videoId': video_id,
            'errorType': type(error).__name__
        }
        
        logger.error(f'Failed to get transcript - detailed error: {error_details}')
        
        # Try to provide more specific error messages
        error_message = 'This video doesn\'t have transcripts available.'
        
        error_str = str(error).lower()
        if 'could not retrieve a transcript' in error_str:
            error_message = 'No transcripts found for this video. The video may not have captions enabled.'
        elif 'unavailable' in error_str:
            error_message = 'This video is unavailable or private.'
        elif 'disabled' in error_str:
            error_message = 'Transcripts are disabled for this video.'
        elif 'age' in error_str:
            error_message = 'This video is age-restricted and transcripts cannot be fetched.'
        
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process video: {error_message} Please try a different video with captions/subtitles enabled."
        )

@router.get("/summarize")
async def get_summarize_status():
    """Get the status of summarization service"""
    return SummarizeResponse(gemini=bool(os.getenv('GEMINI_API_KEY')))

@router.post("/summarize")
async def summarize_video(request: SummarizeRequest):
    """Summarize a YouTube video with streaming response"""
    
    async def stream_response():
        try:
            video_id = extract_video_id(request.url)
            mode = "video"  # Always use video mode

            logger.info('Processing video request', {
                'videoId': video_id,
                'language': request.language,
                'mode': 'video',
                'aiModel': 'gemini'
            })

            # Send initial progress
            yield json.dumps({
                'type': 'progress',
                'message': 'Starting video processing...',
                'progress': 5
            }) + '\n'

            # Get transcript
            yield json.dumps({
                'type': 'progress', 
                'message': 'Fetching video transcript...', 
                'progress': 20
            }) + '\n'

            transcript_data = await get_transcript(video_id)
            transcript = transcript_data['transcript']
            title = transcript_data['title']

            yield json.dumps({
                'type': 'progress',
                'message': 'Transcript fetched successfully, analyzing content...',
                'progress': 50
            }) + '\n'

            yield json.dumps({
                'type': 'progress',
                'message': 'Generating summary with detailed visual information...',
                'progress': 60
            }) + '\n'

            # Generate summary using Gemini with visual context
            model = get_gemini_client()
            chunks = await split_transcript_into_chunks(transcript)
            summary_content = ''

            if len(chunks) == 1:
                prompt = create_summary_prompt(transcript, request.language)
                response = model.generate_content(prompt)
                summary_content = clean_model_output(response.text)
            else:
                # Process chunks and combine
                chunk_summaries = []
                for i, chunk in enumerate(chunks):
                    yield json.dumps({
                        'type': 'progress',
                        'message': f'Processing chunk {i+1} of {len(chunks)}...',
                        'progress': 60 + (i * 15 // len(chunks))
                    }) + '\n'
                    
                    prompt = create_summary_prompt(chunk, request.language)
                    response = model.generate_content(prompt)
                    chunk_summary = clean_model_output(response.text)
                    chunk_summaries.append(chunk_summary)

                # Combine all chunk summaries
                combined_content = '\n\n'.join(chunk_summaries)
                final_prompt = create_summary_prompt(combined_content, request.language)
                response = model.generate_content(final_prompt)
                summary_content = clean_model_output(response.text)

            yield json.dumps({
                'type': 'progress',
                'message': 'Saving summary to database...',
                'progress': 85
            }) + '\n'

            # Save to database
            try:
                if not supabase:
                    raise Exception('Database service not available. Please configure Supabase environment variables.')
                    
                result = supabase.table('summaries').insert({
                    'video_id': video_id,
                    'title': title,
                    'video_url': request.url,
                    'summary': summary_content,
                    'transcript': transcript,
                    'language': request.language,
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
                'title': title,
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
        media_type="text/plain",
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    )





 

 