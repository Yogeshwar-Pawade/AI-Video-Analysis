import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import os
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
import logging
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

@dataclass
class UploadProgress:
    loaded: int
    total: int
    percentage: int

@dataclass
class S3UploadResult:
    key: str
    location: str
    bucket: str
    etag: str

class S3MultipartUpload:
    def __init__(self, bucket: Optional[str] = None, key_prefix: str = "videos/"):
        self.bucket = bucket or os.getenv("AWS_S3_BUCKET", "")
        self.key_prefix = key_prefix
        
        if not self.bucket:
            raise ValueError("AWS S3 bucket name is required. Set AWS_S3_BUCKET environment variable.")
        
        # Initialize S3 client
        self.s3_client = boto3.client(
            's3',
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
        )
    
    async def upload_file(self, file_data: bytes, file_name: str, content_type: str) -> S3UploadResult:
        """Upload a file to S3"""
        timestamp = int(time.time() * 1000)
        sanitized_name = "".join(c if c.isalnum() or c in ".-_" else "_" for c in file_name)
        key = f"{self.key_prefix}{timestamp}_{sanitized_name}"
        
        try:
            response = self.s3_client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=file_data,
                ContentType=content_type,
                Metadata={
                    'originalName': file_name,
                    'fileSize': str(len(file_data)),
                    'uploadTimestamp': str(timestamp)
                }
            )
            
            return S3UploadResult(
                key=key,
                location=f"https://{self.bucket}.s3.amazonaws.com/{key}",
                bucket=self.bucket,
                etag=response['ETag'].strip('"')
            )
        except Exception as e:
            logger.error(f"S3 upload failed: {e}")
            raise Exception(f"Failed to upload file to S3: {str(e)}")
    
    async def get_presigned_upload_url(self, file_name: str, file_type: str, file_size: int) -> Dict[str, Any]:
        """Generate a presigned URL for direct client-side upload"""
        timestamp = int(time.time() * 1000)
        sanitized_name = "".join(c if c.isalnum() or c in ".-_" else "_" for c in file_name)
        key = f"{self.key_prefix}{timestamp}_{sanitized_name}"
        
        try:
            logger.info(f"Generating presigned PUT URL for: {file_name}, type: {file_type}, size: {file_size}")
            
            # Generate presigned URL for PUT operation
            upload_url = self.s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket,
                    'Key': key,
                    'ContentType': file_type,
                    'Metadata': {
                        'original-name': file_name,
                        'file-size': str(file_size),
                        'upload-timestamp': str(timestamp)
                    }
                },
                ExpiresIn=3600  # 1 hour
            )
            
            logger.info(f"Generated presigned PUT URL successfully for key: {key}")
            
            return {
                'uploadUrl': upload_url,
                'key': key
            }
        except Exception as e:
            logger.error(f"Failed to generate presigned PUT URL: {e}")
            raise Exception(f"Failed to generate upload URL: {str(e)}")
    
    async def delete_file(self, key: str) -> None:
        """Delete a file from S3"""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as e:
            logger.error(f"Failed to delete file from S3: {e}")
            raise Exception(f"Failed to delete file: {str(e)}")
    
    async def get_file_info(self, key: str) -> Dict[str, Any]:
        """Get file metadata and check if it exists"""
        try:
            response = self.s3_client.head_object(Bucket=self.bucket, Key=key)
            return {
                'exists': True,
                'size': response.get('ContentLength'),
                'lastModified': response.get('LastModified'),
                'contentType': response.get('ContentType')
            }
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return {'exists': False}
            raise Exception(f"Failed to get file info: {str(e)}")
    
    async def download_file(self, key: str) -> Dict[str, Any]:
        """Download a file from S3"""
        try:
            response = self.s3_client.get_object(Bucket=self.bucket, Key=key)
            return {
                'buffer': response['Body'].read(),
                'contentType': response.get('ContentType'),
                'contentLength': response.get('ContentLength')
            }
        except Exception as e:
            logger.error(f"Failed to download file from S3: {e}")
            raise Exception(f"Failed to download file: {str(e)}")

def validate_aws_config() -> Dict[str, Any]:
    """Validate AWS configuration"""
    required_vars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY', 
        'AWS_REGION',
        'AWS_S3_BUCKET'
    ]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    
    return {
        'isValid': len(missing) == 0,
        'missing': missing
    }

# Create default instances
s3_upload = S3MultipartUpload()
s3_downloader = S3MultipartUpload()  # For downloading files 