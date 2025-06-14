import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { s3Downloader } from "@/lib/s3-downloader";
import { googleFilesProcessor, type VideoProcessingResult } from "@/lib/google-files";

// Logger utility
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error: any) => {
    console.error(`[ERROR] ${message}`, {
      message: error?.message,
      status: error?.status,
      stack: error?.stack,
      cause: error?.cause,
      details: error?.details,
      response: error?.response,
    });
  },
  debug: (message: string, data?: any) => {
    console.debug(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

// Process video using S3 → Google Files API → Gemini workflow
async function processVideoFromS3(s3Key: string, fileName: string): Promise<VideoProcessingResult> {
  try {
    logger.info(`Starting S3 → Google Files → Gemini workflow for: ${fileName} (S3 key: ${s3Key})`);
    
    // Step 1: Download video from S3
    logger.info('Step 1: Downloading from S3...');
    const downloadResult = await s3Downloader.downloadFile(s3Key);
    
    logger.info(`Downloaded ${downloadResult.contentLength} bytes from S3`, {
      contentType: downloadResult.contentType,
      size: downloadResult.contentLength
    });
    
    // Step 2: Process with Google Files API + Gemini
    logger.info('Step 2: Processing with Google Files API + Gemini...');
    const result = await googleFilesProcessor.processVideo(
      downloadResult.buffer,
      fileName,
      downloadResult.contentType
    );
    
    logger.info('Video processing completed successfully');
    return result;
    
  } catch (error) {
    logger.error('S3 → Google Files → Gemini workflow failed', error);
    throw new Error(`Video processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(req: Request) {
  try {
    const { s3Key, fileName } = await req.json();
    
    if (!s3Key || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: s3Key, fileName' },
        { status: 400 }
      );
    }

    logger.info(`Processing S3 video: ${s3Key}, fileName: ${fileName}`);

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    let isWriterClosed = false;

    const writeProgress = async (data: any) => {
      if (!isWriterClosed) {
        try {
          await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (error) {
          logger.error('Failed to write progress', error);
        }
      }
    };

    const closeWriter = async () => {
      if (!isWriterClosed) {
        try {
          isWriterClosed = true;
          await writer.close();
        } catch (error) {
          logger.error('Failed to close writer', error);
        }
      }
    };

    // Start processing asynchronously
    (async () => {
      try {
        await writeProgress({ 
          type: 'progress', 
          message: 'Downloading video from S3...', 
          progress: 10 
        });

        // Step 1: Download from S3
        const downloadResult = await s3Downloader.downloadFile(s3Key);
        
        await writeProgress({ 
          type: 'progress', 
          message: 'Uploading to Google Files API...', 
          progress: 30 
        });

        // Step 2: Upload to Google Files API
        const uploadResult = await googleFilesProcessor.uploadToGoogleFiles(
          downloadResult.buffer,
          fileName,
          downloadResult.contentType
        );

        await writeProgress({ 
          type: 'progress', 
          message: 'Waiting for Google Files processing...', 
          progress: 50 
        });

        // Step 3: Wait for Google processing
        await googleFilesProcessor.waitForFileProcessing(uploadResult.name);

        await writeProgress({ 
          type: 'progress', 
          message: 'Generating transcript and summary with Gemini...', 
          progress: 70 
        });

        // Step 4: Process with Gemini
        const result = await googleFilesProcessor.processVideoWithGemini(
          uploadResult.fileUri,
          fileName,
          downloadResult.contentType
        );

        await writeProgress({ 
          type: 'progress', 
          message: 'Cleaning up Google Files...', 
          progress: 85 
        });

        // Step 5: Cleanup Google Files
        await googleFilesProcessor.deleteGoogleFile(uploadResult.name);

        await writeProgress({ 
          type: 'progress', 
          message: 'Saving to database...', 
          progress: 90 
        });

        // Step 6: Save to database
        const { data, error } = await supabase
          .from('summaries')
          .insert({
            video_id: s3Key,
            title: fileName,
            video_url: `s3://${s3Key}`,
            summary: result.summary,
            transcript: result.transcript,
            language: 'en',
            ai_model: 'gemini-2.0-flash-001',
            video_duration: result.duration || 0,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          logger.error('Database error:', error);
          throw new Error('Failed to save summary to database');
        }

        await writeProgress({ 
          type: 'complete', 
          message: 'Video processing completed successfully!', 
          progress: 100,
          summary: result.summary,
          transcript: result.transcript,
          summaryId: data.id,
          title: fileName,
          s3Key
        });

      } catch (error) {
        logger.error('Video processing failed:', error);
        await writeProgress({ 
          type: 'error', 
          message: error instanceof Error ? error.message : 'Failed to process video',
          progress: 0 
        });
      } finally {
        await closeWriter();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    logger.error('Request processing failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process request' },
      { status: 500 }
    );
  }
} 