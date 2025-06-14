import { GoogleGenerativeAI } from "@google/generative-ai";

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[GOOGLE-FILES] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error: any) => {
    console.error(`[GOOGLE-FILES] ${message}`, {
      message: error?.message,
      status: error?.status,
      stack: error?.stack,
    });
  },
};

export interface GoogleFileUploadResult {
  fileUri: string;
  name: string;
  mimeType: string;
  sizeBytes: string;
  state: string;
}

export interface VideoProcessingResult {
  transcript: string;
  summary: string;
  duration?: number;
}

export class GoogleFilesProcessor {
  private genAI: GoogleGenerativeAI;
  
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Please add GEMINI_API_KEY to environment variables.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Upload file to Google Files API using resumable upload
   */
  async uploadToGoogleFiles(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<GoogleFileUploadResult> {
    logger.info(`Uploading file to Google Files API: ${fileName}`);

    try {
      // Step 1: Initiate resumable upload
      const metadata = {
        file: {
          display_name: fileName,
        },
      };

      logger.info('Starting resumable upload session', {
        fileName,
        fileSize: fileBuffer.length,
        mimeType
      });

      const initResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': fileBuffer.length.toString(),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      });

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        logger.error('Failed to initiate resumable upload', { 
          status: initResponse.status, 
          error: errorText 
        });
        throw new Error(`Failed to initiate upload: ${initResponse.status} - ${errorText}`);
      }

      // Step 2: Get upload URL from response headers
      const uploadUrl = initResponse.headers.get('x-goog-upload-url');
      if (!uploadUrl) {
        throw new Error('No upload URL received from Google Files API');
      }

      logger.info('Upload session initiated, uploading file data', { uploadUrl });

      // Step 3: Upload the actual file data
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Length': fileBuffer.length.toString(),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: fileBuffer,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        logger.error('Failed to upload file data', { 
          status: uploadResponse.status, 
          error: errorText 
        });
        throw new Error(`Failed to upload file data: ${uploadResponse.status} - ${errorText}`);
      }

      const result = await uploadResponse.json();
      logger.info('File uploaded successfully to Google Files API', result);
      
      // Check if the response has the expected structure
      if (!result.file || !result.file.name || !result.file.uri) {
        logger.error('Unexpected upload response format', result);
        throw new Error('Google Files API returned unexpected response format');
      }
      
      return {
        fileUri: result.file.uri,
        name: result.file.name,
        mimeType: result.file.mimeType,
        sizeBytes: result.file.sizeBytes,
        state: result.file.state,
      };
    } catch (error) {
      logger.error('Failed to upload to Google Files API', error);
      throw new Error(`Failed to upload to Google Files API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Wait for file processing to complete
   */
  async waitForFileProcessing(fileName: string, maxWaitTime: number = 300000): Promise<boolean> {
    logger.info(`Waiting for file processing: ${fileName}`);
    
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Use the file name (not URI) for status checking
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${process.env.GEMINI_API_KEY}`, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Failed to check file status', { 
            status: response.status, 
            statusText: response.statusText,
            error: errorText 
          });
          throw new Error(`Failed to check file status: ${response.status} - ${errorText}`);
        }

        const fileInfo = await response.json();
        logger.info('File processing status', { 
          state: fileInfo.state, 
          name: fileInfo.name,
          mimeType: fileInfo.mimeType 
        });

        if (fileInfo.state === 'ACTIVE') {
          logger.info('File processing completed successfully');
          return true;
        } else if (fileInfo.state === 'FAILED') {
          throw new Error('File processing failed on Google servers');
        }

        logger.info(`File state: ${fileInfo.state}, waiting ${pollInterval/1000}s before next check...`);
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        logger.error('Error checking file processing status', error);
        throw error;
      }
    }

    throw new Error(`File processing timeout after ${maxWaitTime / 1000} seconds`);
  }

  /**
   * Generate transcript and summary using Gemini
   */
  async processVideoWithGemini(
    fileUri: string,
    fileName: string,
    mimeType: string
  ): Promise<VideoProcessingResult> {
    logger.info(`Processing video with Gemini: ${fileName}`);

    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

      // Create prompt for video analysis
      const prompt = `
You are an expert video analyst. Please analyze this video file and provide:

1. **Complete Transcript**: Extract all spoken content from the video
2. **Comprehensive Summary**: Create a detailed summary of the key points, insights, and conclusions

For the video "${fileName}":

Instructions:
- Extract ALL spoken words accurately
- Identify main topics and key points
- Highlight important insights and conclusions
- Structure the summary with clear sections
- Use markdown formatting for readability
- Focus on actionable information and key takeaways

Please provide your response in this exact format:

## TRANSCRIPT
[Complete transcript here]

## SUMMARY
[Comprehensive summary here]
`;

      // Generate content with the uploaded file
      const result = await model.generateContent([
        prompt,
        {
          fileData: {
            fileUri: fileUri,
            mimeType: mimeType
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse the response to extract transcript and summary
      const sections = this.parseGeminiResponse(text);
      
      logger.info('Video processing completed successfully');
      
      return {
        transcript: sections.transcript,
        summary: sections.summary,
      };
    } catch (error) {
      logger.error('Failed to process video with Gemini', error);
      throw new Error(`Failed to process video with Gemini: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse Gemini response to extract transcript and summary
   */
  private parseGeminiResponse(text: string): { transcript: string; summary: string } {
    const transcriptMatch = text.match(/## TRANSCRIPT\s*([\s\S]*?)(?=## SUMMARY|$)/i);
    const summaryMatch = text.match(/## SUMMARY\s*([\s\S]*?)$/i);

    const transcript = transcriptMatch ? transcriptMatch[1].trim() : text;
    const summary = summaryMatch ? summaryMatch[1].trim() : text;

    return {
      transcript: transcript || 'Transcript extraction failed',
      summary: summary || text, // Fallback to full text if parsing fails
    };
  }

  /**
   * Clean up uploaded file from Google Files API
   */
  async deleteGoogleFile(fileName: string): Promise<void> {
    logger.info(`Deleting file from Google Files API: ${fileName}`);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to delete file from Google Files API', { 
          status: response.status,
          error: errorText 
        });
      } else {
        logger.info('File deleted successfully from Google Files API');
      }
    } catch (error) {
      logger.error('Error deleting file from Google Files API', error);
      // Don't throw error for cleanup operations
    }
  }

  /**
   * Complete workflow: upload, process, and cleanup
   */
  async processVideo(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<VideoProcessingResult> {
    let uploadedFile: GoogleFileUploadResult | null = null;

    try {
      // Step 1: Upload to Google Files API
      uploadedFile = await this.uploadToGoogleFiles(fileBuffer, fileName, mimeType);

      // Step 2: Wait for processing (use file name, not URI)
      await this.waitForFileProcessing(uploadedFile.name);

      // Step 3: Process with Gemini (use file URI)
      const result = await this.processVideoWithGemini(uploadedFile.fileUri, fileName, mimeType);

      return result;
    } finally {
      // Step 4: Cleanup (always attempt cleanup using file name)
      if (uploadedFile) {
        await this.deleteGoogleFile(uploadedFile.name);
      }
    }
  }
}

// Export default instance
export const googleFilesProcessor = new GoogleFilesProcessor(); 