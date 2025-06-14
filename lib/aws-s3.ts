import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface S3UploadResult {
  key: string;
  location: string;
  bucket: string;
  etag: string;
}

export class S3MultipartUpload {
  private bucket: string;
  private keyPrefix: string;

  constructor(bucket?: string, keyPrefix: string = "videos/") {
    this.bucket = bucket || process.env.AWS_S3_BUCKET || "";
    this.keyPrefix = keyPrefix;
    
    if (!this.bucket) {
      throw new Error("AWS S3 bucket name is required. Set AWS_S3_BUCKET environment variable.");
    }
  }

  /**
   * Upload a file to S3 using multipart upload with progress tracking
   */
  async uploadFile(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<S3UploadResult> {
    // Generate unique key for the file
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${this.keyPrefix}${timestamp}_${sanitizedName}`;

    try {
      // Convert File to Buffer for server-side upload
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Create multipart upload
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: file.type,
          Metadata: {
            originalName: file.name,
            fileSize: file.size.toString(),
            uploadTimestamp: timestamp.toString(),
          },
        },
        // Configure multipart upload settings
        partSize: 10 * 1024 * 1024, // 10 MB parts
        leavePartsOnError: false, // Clean up on failure
      });

      // Track upload progress
      if (onProgress) {
        upload.on("httpUploadProgress", (progress) => {
          const loaded = progress.loaded || 0;
          const total = progress.total || file.size;
          const percentage = Math.round((loaded / total) * 100);
          
          onProgress({
            loaded,
            total,
            percentage,
          });
        });
      }

      // Execute upload
      const result = await upload.done();

      return {
        key: result.Key!,
        location: result.Location!,
        bucket: result.Bucket!,
        etag: result.ETag!,
      };
    } catch (error) {
      console.error("S3 upload failed:", error);
      throw new Error(`Failed to upload file to S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a presigned URL for direct client-side upload using PUT method
   */
  async getPresignedUploadUrl(
    fileName: string,
    fileType: string,
    fileSize: number
  ): Promise<{
    uploadUrl: string;
    key: string;
    fields?: Record<string, string>;
  }> {
    const timestamp = Date.now();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${this.keyPrefix}${timestamp}_${sanitizedName}`;

    try {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      
      console.log(`Generating presigned PUT URL for: ${fileName}, type: ${fileType}, size: ${fileSize}`);
      
      // Create a PUT object command
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: fileType,
        Metadata: {
          'original-name': fileName,
          'file-size': fileSize.toString(),
          'upload-timestamp': timestamp.toString(),
        },
      });

      // Generate presigned URL for PUT operation
      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600, // 1 hour
      });

      console.log(`Generated presigned PUT URL successfully for key: ${key}`);

      return {
        uploadUrl,
        key,
        // No fields needed for PUT method
      };
    } catch (error) {
      console.error("Failed to generate presigned PUT URL:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw new Error(`Failed to generate upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      
      await s3Client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
    } catch (error) {
      console.error("Failed to delete file from S3:", error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file metadata and check if it exists
   */
  async getFileInfo(key: string): Promise<{
    exists: boolean;
    size?: number;
    lastModified?: Date;
    contentType?: string;
  }> {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      
      const result = await s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return {
        exists: true,
        size: result.ContentLength,
        lastModified: result.LastModified,
        contentType: result.ContentType,
      };
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      
      console.error("Failed to get file info:", error);
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }
}

// Export default instance
export const s3Upload = new S3MultipartUpload();

// Utility function to validate AWS configuration
export function validateAWSConfig(): { isValid: boolean; missing: string[] } {
  const required = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY", 
    "AWS_S3_BUCKET",
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  return {
    isValid: missing.length === 0,
    missing,
  };
} 