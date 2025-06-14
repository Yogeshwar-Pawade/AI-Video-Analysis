from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging
from dotenv import load_dotenv

from lib.aws_s3 import s3_upload, validate_aws_config

# Load environment variables from .env file
load_dotenv()

router = APIRouter()

# Logger
logger = logging.getLogger(__name__)

class PresignedUploadRequest(BaseModel):
    fileName: str
    fileType: str
    fileSize: int

class PresignedUploadResponse(BaseModel):
    success: bool
    uploadUrl: str
    key: str
    fields: Optional[Dict[str, Any]] = None

class ErrorResponse(BaseModel):
    error: str
    missing: Optional[list] = None
    message: Optional[str] = None

@router.post("/upload/presigned", response_model=PresignedUploadResponse)
async def create_presigned_upload_url(request: PresignedUploadRequest):
    """Generate a presigned URL for S3 upload"""
    
    try:
        # Validate AWS configuration
        aws_config = validate_aws_config()
        if not aws_config['isValid']:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "AWS configuration incomplete",
                    "missing": aws_config['missing'],
                    "message": f"Missing environment variables: {', '.join(aws_config['missing'])}"
                }
            )

        # Validate input
        if not request.fileName or not request.fileType or not request.fileSize:
            raise HTTPException(
                status_code=400,
                detail={"error": "Missing required fields: fileName, fileType, fileSize"}
            )

        # Validate file type
        if not request.fileType.startswith('video/'):
            raise HTTPException(
                status_code=400,
                detail={"error": "Only video files are allowed"}
            )

        # Validate file size (500MB limit)
        max_size = 500 * 1024 * 1024  # 500MB
        if request.fileSize > max_size:
            raise HTTPException(
                status_code=400,
                detail={"error": "File size too large. Maximum 500MB allowed."}
            )

        # Generate presigned URL
        presigned_data = await s3_upload.get_presigned_upload_url(
            request.fileName,
            request.fileType,
            request.fileSize
        )

        return PresignedUploadResponse(
            success=True,
            uploadUrl=presigned_data['uploadUrl'],
            key=presigned_data['key'],
            fields=presigned_data.get('fields')
        )

    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Failed to generate presigned URL: {str(error)}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to generate upload URL",
                "message": str(error)
            }
        ) 