import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "@/lib/supabase";

// Add at the top of the file after imports
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

// Initialize Gemini client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add your API key in the environment variables.');
  }
  return new GoogleGenerativeAI(apiKey);
}

// Helper function to clean model outputs
function cleanModelOutput(text: string): string {
  return text
    .replace(/^(Okay|Here'?s?( is)?|Let me|I will|I'll|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly|Alright)[^]*?,\s*/i, '')
    .replace(/^(Here'?s?( is)?|I'?ll?|Let me|I will|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly)[^]*?(summary|translate|breakdown|analysis).*?:\s*/i, '')
    .replace(/^(Based on|According to).*?,\s*/i, '')
    .replace(/^I understand.*?[.!]\s*/i, '')
    .replace(/^(Now|First|Let's),?\s*/i, '')
    .replace(/^(Here are|The following is|This is|Below is).*?:\s*/i, '')
    .replace(/^(I'll provide|Let me break|I'll break|I'll help|I've structured).*?:\s*/i, '')
    .replace(/^(As requested|Following your|In response to).*?:\s*/i, '')
    .replace(/^[^:\n🎯🎙️#*\-•]+:\s*/gm, '')
    .replace(/^(?![#*\-•🎯️])[\s\d]+\.\s*/gm, '')
    .trim();
}

// Gemini model configuration
const geminiModel = {
  async generateContent(prompt: string) {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return cleanModelOutput(response.text());
  }
};

// Function to extract audio from video and generate transcript
async function extractAudioFromVideo(videoFile: File): Promise<string> {
  logger.info(`Starting audio extraction from video file: ${videoFile.name}`);
  
  try {
    // For this demo, we'll generate a realistic mock transcript
    // In production, you would use services like:
    // - Google Cloud Speech-to-Text
    // - Azure Speech Services  
    // - AWS Transcribe
    // - OpenAI Whisper API
    
    logger.info('Processing video file for transcription');
    
    // Simulate processing time based on file size
    const processingDelay = Math.min(2000, videoFile.size / 1000000); // Max 2 seconds
    await new Promise(resolve => setTimeout(resolve, processingDelay));
    
    // Generate a realistic mock transcript based on file properties
    const fileSizeMB = Math.round(videoFile.size / (1024 * 1024));
    const estimatedDurationMinutes = Math.max(1, Math.min(30, fileSizeMB / 10)); // Rough estimate
    
    const mockTranscript = `
    Welcome to this video presentation titled "${videoFile.name.replace(/\.[^/.]+$/, "")}".
    
    This is a demonstration of our AI-powered video summarization system. In a real-world scenario, 
    this transcript would contain the actual spoken content from your uploaded video file.
    
    The video file you uploaded is approximately ${fileSizeMB}MB in size, with an estimated duration 
    of ${Math.round(estimatedDurationMinutes)} minutes. Our system has successfully processed the audio 
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
    `;
    
    logger.info('Mock transcript generated successfully');
    return mockTranscript.trim();
    
  } catch (error) {
    logger.error('Failed to extract audio from video', error);
    throw new Error('Failed to process video audio. Please ensure the video file contains audio.');
  }
}



// Function to create summary prompt for video content
function createVideoSummaryPrompt(transcript: string, fileName: string): string {
  return `
You are an expert AI assistant that creates concise, informative summaries of video content based on transcripts.

**Video File:** ${fileName}

**Instructions:**
- Create a comprehensive but concise summary of the video content
- Identify key topics, main points, and important information
- Structure the summary with clear sections if applicable
- Highlight any actionable insights or conclusions
- Use markdown formatting for better readability
- Focus on the most valuable information from the transcript

**Transcript:**
${transcript}

Please provide a well-structured summary that captures the essence and key information from this video.
`;
}

async function splitTranscriptIntoChunks(transcript: string, chunkSize: number = 7000, overlap: number = 1000): Promise<string[]> {
  const words = transcript.split(' ');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      const overlapWords = currentChunk.slice(-Math.floor(overlap / 10));
      currentChunk = [...overlapWords];
      currentLength = overlapWords.join(' ').length;
    }
    currentChunk.push(word);
    currentLength += word.length + 1;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const videoFile = formData.get('video') as File;
    
    if (!videoFile) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    logger.info(`Processing video file: ${videoFile.name}, size: ${videoFile.size} bytes`);

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
          message: 'Processing video file...', 
          progress: 10 
        });

        // Extract audio and transcribe
        await writeProgress({ 
          type: 'progress', 
          message: 'Extracting audio from video...', 
          progress: 30 
        });

        const transcript = await extractAudioFromVideo(videoFile);

        await writeProgress({ 
          type: 'progress', 
          message: 'Transcription completed, generating summary...', 
          progress: 60 
        });

        // Generate summary using Gemini
        const chunks = await splitTranscriptIntoChunks(transcript);
        let summaryContent = '';

        if (chunks.length === 1) {
          const prompt = createVideoSummaryPrompt(transcript, videoFile.name);
          summaryContent = await geminiModel.generateContent(prompt);
        } else {
          // Handle multiple chunks
          const chunkSummaries = [];
          for (let i = 0; i < chunks.length; i++) {
            await writeProgress({ 
              type: 'progress', 
              message: `Processing chunk ${i + 1} of ${chunks.length}...`, 
              progress: 60 + (i / chunks.length) * 20 
            });
            
            const chunkPrompt = createVideoSummaryPrompt(chunks[i], `${videoFile.name} (Part ${i + 1})`);
            const chunkSummary = await geminiModel.generateContent(chunkPrompt);
            chunkSummaries.push(chunkSummary);
          }
          
          // Combine chunk summaries
          const combinedPrompt = `
Please create a comprehensive summary by combining these individual section summaries from a video file named "${videoFile.name}":

${chunkSummaries.map((summary, index) => `**Section ${index + 1}:**\n${summary}`).join('\n\n')}

Create a cohesive, well-structured summary that captures all the key information.
`;
          summaryContent = await geminiModel.generateContent(combinedPrompt);
        }

        await writeProgress({ 
          type: 'progress', 
          message: 'Saving summary...', 
          progress: 90 
        });

        // Save to database
        const { data, error } = await supabase
          .from('summaries')
          .insert({
            video_id: `video_${Date.now()}`,
            title: videoFile.name,
            video_url: `local://${videoFile.name}`,
            summary: summaryContent,
            transcript,
            language: 'en',
            ai_model: 'gemini-2.0-flash-001',
            video_duration: 0, // We could calculate this from the audio buffer
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
          message: 'Video processing completed!', 
          progress: 100,
          summary: summaryContent,
          summaryId: data.id,
          title: videoFile.name
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