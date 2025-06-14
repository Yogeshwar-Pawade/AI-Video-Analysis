import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[S3-DOWNLOADER] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error: any) => {
    console.error(`[S3-DOWNLOADER] ${message}`, {
      message: error?.message,
      status: error?.status,
      stack: error?.stack,
    });
  },
};

export interface S3DownloadResult {
  buffer: Buffer;
  contentType: string;
  contentLength: number;
  lastModified?: Date;
}

export class S3Downloader {
  private bucket: string;

  constructor(bucket?: string) {
    this.bucket = bucket || process.env.AWS_S3_BUCKET || "";
    
    if (!this.bucket) {
      throw new Error("AWS S3 bucket name is required. Set AWS_S3_BUCKET environment variable.");
    }
  }

  /**
   * Download file from S3 and return as Buffer
   */
  async downloadFile(s3Key: string): Promise<S3DownloadResult> {
    logger.info(`Downloading file from S3: ${s3Key}`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });

      const response = await s3Client.send(command);

      if (!response.Body) {
        throw new Error('No file content received from S3');
      }

      // Convert stream to buffer
      const buffer = await this.streamToBuffer(response.Body as Readable);

      logger.info('File downloaded successfully from S3', {
        size: buffer.length,
        contentType: response.ContentType,
        lastModified: response.LastModified,
      });

      return {
        buffer,
        contentType: response.ContentType || 'application/octet-stream',
        contentLength: buffer.length,
        lastModified: response.LastModified,
      };
    } catch (error) {
      logger.error('Failed to download file from S3', error);
      throw new Error(`Failed to download file from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      stream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(s3Key: string): Promise<boolean> {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      
      await s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      }));
      
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata without downloading
   */
  async getFileMetadata(s3Key: string): Promise<{
    size: number;
    contentType: string;
    lastModified?: Date;
  }> {
    try {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      
      const response = await s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      }));

      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified,
      };
    } catch (error) {
      logger.error('Failed to get file metadata', error);
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export default instance
export const s3Downloader = new S3Downloader(); 