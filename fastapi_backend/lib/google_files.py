import google.generativeai as genai
import aiohttp
import asyncio
import os
import json
import logging
from typing import Dict, Any, Optional
from dataclasses import dataclass
from dotenv import load_dotenv
import ssl

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

# Create SSL context that can handle certificate verification issues
def create_ssl_context():
    """Create SSL context with proper certificate handling"""
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    return ssl_context

@dataclass
class GoogleFileUploadResult:
    file_uri: str
    name: str
    mime_type: str
    size_bytes: str
    state: str

@dataclass
class VideoProcessingResult:
    transcript: str
    summary: str
    duration: Optional[int] = None

class GoogleFilesProcessor:
    def __init__(self):
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError('Gemini API key is not configured. Please add GEMINI_API_KEY to environment variables.')
        self.api_key = api_key
        genai.configure(api_key=api_key)

    def clean_model_output(self, text: str) -> str:
        """Clean model outputs to remove meta-commentary"""
        import re
        text = re.sub(r'^(Okay|Here\'?s?( is)?|Let me|I will|I\'ll|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly|Alright).*?,\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^(Here\'?s?( is)?|I\'?ll?|Let me|I will|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly).*?(summary|translate|breakdown|analysis).*?:\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^(Based on|According to).*?,\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^I understand.*?[.!]\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^(Now|First|Let\'s),?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^(Here are|The following is|This is|Below is).*?:\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^(I\'ll provide|Let me break|I\'ll break|I\'ll help|I\'ve structured).*?:\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^(As requested|Following your|In response to).*?:\s*', '', text, flags=re.IGNORECASE)
        return text.strip()

    async def upload_to_google_files(self, file_buffer: bytes, file_name: str, mime_type: str) -> GoogleFileUploadResult:
        """Upload file to Google Files API using resumable upload"""
        logger.info(f"Uploading file to Google Files API: {file_name}")

        try:
            # Step 1: Initiate resumable upload
            metadata = {
                "file": {
                    "display_name": file_name,
                },
            }

            logger.info("Starting resumable upload session", {
                "fileName": file_name,
                "fileSize": len(file_buffer),
                "mimeType": mime_type
            })

            # Create SSL context and connector
            ssl_context = create_ssl_context()
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            
            async with aiohttp.ClientSession(connector=connector) as session:
                # Step 1: Initiate upload
                init_url = f"https://generativelanguage.googleapis.com/upload/v1beta/files?key={self.api_key}"
                init_headers = {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': str(len(file_buffer)),
                    'X-Goog-Upload-Header-Content-Type': mime_type,
                    'Content-Type': 'application/json',
                }

                async with session.post(init_url, headers=init_headers, json=metadata) as init_response:
                    if not init_response.ok:
                        error_text = await init_response.text()
                        logger.error('Failed to initiate resumable upload', {
                            'status': init_response.status,
                            'error': error_text
                        })
                        raise Exception(f"Failed to initiate upload: {init_response.status} - {error_text}")

                    # Step 2: Get upload URL from response headers
                    upload_url = init_response.headers.get('x-goog-upload-url')
                    if not upload_url:
                        raise Exception('No upload URL received from Google Files API')

                    logger.info('Upload session initiated, uploading file data', {'uploadUrl': upload_url})

                # Step 3: Upload the actual file data
                upload_headers = {
                    'Content-Length': str(len(file_buffer)),
                    'X-Goog-Upload-Offset': '0',
                    'X-Goog-Upload-Command': 'upload, finalize',
                }

                async with session.post(upload_url, headers=upload_headers, data=file_buffer) as upload_response:
                    if not upload_response.ok:
                        error_text = await upload_response.text()
                        logger.error('Failed to upload file data', {
                            'status': upload_response.status,
                            'error': error_text
                        })
                        raise Exception(f"Failed to upload file data: {upload_response.status} - {error_text}")

                    result = await upload_response.json()
                    logger.info('File uploaded successfully to Google Files API', result)

                    # Check if the response has the expected structure
                    if not result.get('file') or not result['file'].get('name') or not result['file'].get('uri'):
                        logger.error('Unexpected upload response format', result)
                        raise Exception('Google Files API returned unexpected response format')

                    return GoogleFileUploadResult(
                        file_uri=result['file']['uri'],
                        name=result['file']['name'],
                        mime_type=result['file']['mimeType'],
                        size_bytes=result['file']['sizeBytes'],
                        state=result['file']['state'],
                    )
        except Exception as e:
            logger.error(f'Failed to upload to Google Files API: {str(e)}')
            raise Exception(f"Failed to upload to Google Files API: {str(e)}")

    async def wait_for_file_processing(self, file_name: str, max_wait_time: int = 300000) -> bool:
        """Wait for file processing to complete"""
        logger.info(f"Waiting for file processing: {file_name}")

        start_time = asyncio.get_event_loop().time()
        poll_interval = 5  # 5 seconds

        while (asyncio.get_event_loop().time() - start_time) * 1000 < max_wait_time:
            try:
                # Create SSL context and connector
                ssl_context = create_ssl_context()
                connector = aiohttp.TCPConnector(ssl=ssl_context)
                
                async with aiohttp.ClientSession(connector=connector) as session:
                    url = f"https://generativelanguage.googleapis.com/v1beta/{file_name}?key={self.api_key}"
                    async with session.get(url) as response:
                        if not response.ok:
                            error_text = await response.text()
                            logger.error('Failed to check file status', {
                                'status': response.status,
                                'statusText': response.reason,
                                'error': error_text
                            })
                            raise Exception(f"Failed to check file status: {response.status} - {error_text}")

                        file_info = await response.json()
                        logger.info('File processing status', {
                            'state': file_info.get('state'),
                            'name': file_info.get('name'),
                            'mimeType': file_info.get('mimeType')
                        })

                        if file_info.get('state') == 'ACTIVE':
                            logger.info('File processing completed successfully')
                            return True
                        elif file_info.get('state') == 'FAILED':
                            raise Exception('File processing failed on Google servers')

                        logger.info(f"File state: {file_info.get('state')}, waiting {poll_interval}s before next check...")

                        # Wait before next poll
                        await asyncio.sleep(poll_interval)
            except Exception as e:
                logger.error(f'Error checking file processing status: {str(e)}')
                raise e

        raise Exception(f"File processing timeout after {max_wait_time / 1000} seconds")

    async def process_video_with_gemini(self, file_uri: str, google_file_name: str, mime_type: str) -> VideoProcessingResult:
        """Generate transcript and summary using Gemini"""
        logger.info(f"Processing video with Gemini: {google_file_name}")

        try:
            model = genai.GenerativeModel("gemini-2.0-flash-001")

            # Get the file object first
            file_obj = genai.get_file(google_file_name)

            # First, get the transcript
            transcript_prompt = f"""
            Please provide a complete transcript of all spoken content in this video with timestamps. 
            Include only the actual words spoken, without any commentary or analysis.
            Format it as a clean, readable transcript with timestamps in [MM:SS] or [HH:MM:SS] format at the beginning of each segment.
            
            Example format:
            [00:00] Opening words of the video...
            [00:15] Next segment of speech...
            [01:30] Another segment...
            
            Provide the complete timestamped transcript with proper punctuation and paragraph breaks.
            """

            transcript_response = model.generate_content([
                file_obj,
                transcript_prompt
            ])

            transcript_text = transcript_response.text.strip()

            # Then create the summary
            summary_prompt = f"""
            You are an expert content summarizer. Create a comprehensive summary of this video content. Do not include any meta-commentary, introductions, or instructions in your response - provide only the summary content.

            Video Information:
            - File Name: {google_file_name}
            - MIME Type: {mime_type}

            Format your response exactly as follows:

            🎯 **TITLE:** [Extract or create a compelling title for the video]

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

            # Process the video file using the uploaded file            
            summary_response = model.generate_content([
                file_obj,
                summary_prompt
            ])

            summary_text = summary_response.text.strip()
            logger.info('Received summary response from Gemini', {'summaryLength': len(summary_text)})
            logger.info('Received transcript from Gemini', {'transcriptLength': len(transcript_text)})

            # Clean the response text
            summary_content = self.clean_model_output(summary_text)
            transcript_content = self.clean_model_output(transcript_text)

            return VideoProcessingResult(
                transcript=transcript_content,
                summary=summary_content
            )

        except Exception as e:
            logger.error(f'Failed to process video with Gemini: {str(e)}')
            raise Exception(f"Failed to process video with Gemini: {str(e)}")

    def parse_gemini_response(self, text: str) -> Dict[str, str]:
        """Parse Gemini response to extract transcript and summary"""
        try:
            # Try to parse as JSON first
            if text.startswith('{') and text.endswith('}'):
                result = json.loads(text)
                if 'transcript' in result and 'summary' in result:
                    return result

            # Fallback: Split content by markers or use heuristics
            lines = text.split('\n')
            transcript = ""
            summary = ""
            current_section = None

            for line in lines:
                line = line.strip()
                if 'transcript' in line.lower() and ':' in line:
                    current_section = 'transcript'
                    continue
                elif 'summary' in line.lower() and ':' in line:
                    current_section = 'summary'
                    continue
                elif line.startswith('🎯') or line.startswith('📝') or line.startswith('🔑'):
                    current_section = 'summary'
                
                if current_section == 'transcript' and line:
                    transcript += line + '\n'
                elif current_section == 'summary' and line:
                    summary += line + '\n'

            if not transcript or not summary:
                # If parsing fails, treat entire response as summary
                return {
                    'transcript': 'Transcript extraction not available for this video format.',
                    'summary': text
                }

            return {
                'transcript': transcript.strip(),
                'summary': summary.strip()
            }

        except Exception as e:
            logger.error(f'Failed to parse Gemini response: {str(e)}')
            # Return entire text as summary if parsing fails
            return {
                'transcript': 'Transcript extraction failed during processing.',
                'summary': text
            }

    async def delete_google_file(self, file_name: str) -> None:
        """Delete a file from Google Files API"""
        logger.info(f"Deleting Google file: {file_name}")

        try:
            # Create SSL context and connector
            ssl_context = create_ssl_context()
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            
            async with aiohttp.ClientSession(connector=connector) as session:
                url = f"https://generativelanguage.googleapis.com/v1beta/{file_name}?key={self.api_key}"
                async with session.delete(url) as response:
                    if response.ok:
                        logger.info('File deleted successfully from Google Files API')
                    else:
                        error_text = await response.text()
                        logger.error('Failed to delete file from Google Files API', {
                            'status': response.status,
                            'error': error_text
                        })
                        # Don't raise exception for delete failures to avoid breaking the main flow
        except Exception as e:
            logger.error(f'Error deleting file from Google Files API: {str(e)}')
            # Don't raise exception for delete failures

    async def process_video(self, file_buffer: bytes, file_name: str, mime_type: str) -> VideoProcessingResult:
        """Complete workflow: upload → wait → process → cleanup"""
        upload_result = None
        try:
            # Step 1: Upload to Google Files
            upload_result = await self.upload_to_google_files(file_buffer, file_name, mime_type)

            # Step 2: Wait for processing
            await self.wait_for_file_processing(upload_result.name)

            # Step 3: Process with Gemini
            result = await self.process_video_with_gemini(
                upload_result.file_uri,
                upload_result.name,
                mime_type
            )

            return result

        finally:
            # Step 4: Cleanup (always attempt cleanup)
            if upload_result:
                await self.delete_google_file(upload_result.name)

# Create default instance
google_files_processor = GoogleFilesProcessor() 