# Video Summarizer FastAPI Backend

This is a FastAPI backend that provides video summarization capabilities for both YouTube videos and direct video file uploads. It replaces the Next.js API routes with a dedicated Python backend while maintaining all existing functionality.

## Features

- **YouTube Video Summarization**: Extract transcripts and generate AI-powered summaries
- **Direct Video Processing**: Upload and process video files directly
- **S3 Integration**: Support for S3-based video processing workflows
- **Google Files API**: Integration with Google Files API for advanced video processing
- **Streaming Responses**: Real-time progress updates during processing
- **Database Integration**: Supabase integration for storing summaries and history
- **CORS Support**: Configurable CORS for frontend integration

## API Endpoints

### 1. YouTube Summarization
- `GET /api/summarize` - Check service status
- `POST /api/summarize` - Summarize YouTube video with streaming response

### 2. Direct Video Processing
- `POST /api/process-video` - Process uploaded video file

### 3. S3 Video Processing
- `POST /api/process-s3-video` - Process video from S3 storage

### 4. File Upload
- `POST /api/upload/presigned` - Generate S3 presigned upload URLs

### 5. History
- `GET /api/history` - Get all video summaries

## Setup Instructions

### 1. Install Dependencies

```bash
cd fastapi_backend
pip install -r requirements.txt
```

### 2. Environment Variables

Copy the example environment file and configure your variables:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Server Configuration
PORT=8000
HOST=0.0.0.0

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Google AI / Gemini Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your_s3_bucket_name
```

### 3. Run the Server

```bash
# Development mode with auto-reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 4. Update Frontend Configuration

Update your frontend to point to the new FastAPI backend:

```javascript
// Replace Next.js API calls
const API_BASE_URL = 'http://localhost:8000';

// Example: Update fetch calls
fetch(`${API_BASE_URL}/api/summarize`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ url: videoUrl, language: 'en' })
});
```

## Project Structure

```
fastapi_backend/
├── main.py                 # FastAPI app and main entry point
├── requirements.txt        # Python dependencies
├── .env.example           # Environment variables template
├── README.md              # This file
├── api/                   # API route handlers
│   ├── __init__.py
│   ├── summarize.py       # YouTube summarization endpoint
│   ├── process_video.py   # Direct video processing
│   ├── process_s3_video.py# S3 video processing
│   ├── upload.py          # File upload endpoints
│   └── history.py         # History endpoints
└── lib/                   # Shared libraries and utilities
    ├── __init__.py
    ├── supabase_client.py # Supabase database client
    ├── youtube_utils.py   # YouTube utilities
    ├── aws_s3.py          # AWS S3 utilities
    └── google_files.py    # Google Files API integration
```

## Key Features Migrated

### 1. Streaming Responses
All processing endpoints support streaming responses for real-time progress updates:

```python
@router.post("/summarize")
async def summarize_video(request: SummarizeRequest):
    async def stream_response():
        yield json.dumps({'type': 'progress', 'message': 'Starting...', 'progress': 0})
        # ... processing logic
        yield json.dumps({'type': 'complete', 'summary': summary_content})
    
    return StreamingResponse(stream_response(), media_type="text/plain")
```

### 2. Error Handling
Comprehensive error handling with detailed error messages:

```python
try:
    # Processing logic
    pass
except Exception as error:
    logger.error('Processing failed:', error)
    raise HTTPException(status_code=500, detail=str(error))
```

### 3. Database Integration
Seamless Supabase integration maintaining the same database schema:

```python
result = supabase.table('summaries').insert({
    'video_id': video_id,
    'title': title,
    'summary': summary_content,
    'transcript': transcript,
    # ... other fields
}).execute()
```

## Migration from Next.js

The FastAPI backend maintains 100% compatibility with the existing frontend. The only changes needed are:

1. **Update API base URL**: Change from `/api/` to `http://localhost:8000/api/`
2. **Start the FastAPI server**: Run the Python server instead of Next.js
3. **Environment variables**: Copy your existing `.env` variables to the FastAPI backend

## Production Deployment

### Using Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Using PM2

```bash
pip install -r requirements.txt
pm2 start "uvicorn main:app --host 0.0.0.0 --port 8000" --name video-summarizer-api
```

## API Documentation

Once the server is running, visit:
- **Interactive API docs**: http://localhost:8000/docs
- **ReDoc documentation**: http://localhost:8000/redoc

## Health Check

Check if the server is running:
```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000000"
}
```

## Dependencies

### Core Dependencies
- **FastAPI**: Modern web framework for APIs
- **Uvicorn**: ASGI server for FastAPI
- **Pydantic**: Data validation and serialization

### Integration Dependencies
- **supabase**: Database client
- **boto3**: AWS SDK for S3 operations
- **google-generativeai**: Google AI/Gemini integration
- **youtube-transcript-api**: YouTube transcript extraction
- **aiohttp**: Async HTTP client for external APIs

## Troubleshooting

### Common Issues

1. **Missing environment variables**: Ensure all required variables are set in `.env`
2. **Database connection**: Verify Supabase URL and key are correct
3. **AWS permissions**: Check S3 bucket permissions and AWS credentials
4. **API key issues**: Verify Gemini API key is valid and has proper permissions

### Logs

The application logs all operations. Check logs for detailed error information:

```bash
# Run with verbose logging
LOG_LEVEL=DEBUG uvicorn main:app --reload
```

## Contributing

The FastAPI backend maintains the same functionality as the original Next.js API routes. When adding new features:

1. Add new route handlers in the `api/` directory
2. Add shared utilities in the `lib/` directory
3. Update the main app to include new routers
4. Add appropriate error handling and logging
5. Update this README with new endpoints

## License

This project maintains the same license as the original codebase. 