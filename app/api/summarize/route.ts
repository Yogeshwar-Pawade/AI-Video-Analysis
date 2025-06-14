import { NextResponse } from "next/server";
import { YoutubeTranscript } from 'youtube-transcript';
import { supabase } from "@/lib/supabase";
import { extractVideoId, createSummaryPrompt } from '@/lib/youtube';
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    // English prefixes
    .replace(/^(Okay|Here'?s?( is)?|Let me|I will|I'll|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly|Alright)[^]*?,\s*/i, '')
    .replace(/^(Here'?s?( is)?|I'?ll?|Let me|I will|I can|I would|I am going to|Allow me to|Sure|Of course|Certainly)[^]*?(summary|translate|breakdown|analysis).*?:\s*/i, '')
    .replace(/^(Based on|According to).*?,\s*/i, '')
    .replace(/^I understand.*?[.!]\s*/i, '')
    .replace(/^(Now|First|Let's),?\s*/i, '')
    .replace(/^(Here are|The following is|This is|Below is).*?:\s*/i, '')
    .replace(/^(I'll provide|Let me break|I'll break|I'll help|I've structured).*?:\s*/i, '')
    .replace(/^(As requested|Following your|In response to).*?:\s*/i, '')
    // German prefixes
    .replace(/^(Okay|Hier( ist)?|Lass mich|Ich werde|Ich kann|Ich würde|Ich möchte|Erlauben Sie mir|Sicher|Natürlich|Gewiss|In Ordnung)[^]*?,\s*/i, '')
    .replace(/^(Hier( ist)?|Ich werde|Lass mich|Ich kann|Ich würde|Ich möchte)[^]*?(Zusammenfassung|Übersetzung|Analyse).*?:\s*/i, '')
    .replace(/^(Basierend auf|Laut|Gemäß).*?,\s*/i, '')
    .replace(/^Ich verstehe.*?[.!]\s*/i, '')
    .replace(/^(Jetzt|Zunächst|Lass uns),?\s*/i, '')
    .replace(/^(Hier sind|Folgendes|Dies ist|Im Folgenden).*?:\s*/i, '')
    .replace(/^(Ich werde|Lass mich|Ich helfe|Ich habe strukturiert).*?:\s*/i, '')
    .replace(/^(Wie gewünscht|Entsprechend Ihrer|Als Antwort auf).*?:\s*/i, '')
    // Remove meta instructions while preserving markdown
    .replace(/^[^:\n🎯🎙️#*\-•]+:\s*/gm, '')  // Remove prefixes but keep markdown and emojis
    .replace(/^(?![#*\-•🎯️])[\s\d]+\.\s*/gm, '') // Remove numbered lists but keep markdown lists
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

async function splitTranscriptIntoChunks(transcript: string, chunkSize: number = 7000, overlap: number = 1000): Promise<string[]> {
  const words = transcript.split(' ');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      // Keep last few words for overlap
      const overlapWords = currentChunk.slice(-Math.floor(overlap / 10));
      currentChunk = [...overlapWords];
      currentLength = overlapWords.join(' ').length;
    }
    currentChunk.push(word);
    currentLength += word.length + 1; // +1 for space
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

async function getTranscript(videoId: string): Promise<{ transcript: string; source: 'youtube'; title: string }> {
  logger.info(`Attempting to fetch YouTube transcript for video ${videoId}`);
  
  try {
    // Try fetching transcript with different language options
    const languages = ['en', 'en-US', 'en-GB', undefined]; // undefined lets the library auto-detect
    let transcriptList = null;
    let lastError = null;

    for (const lang of languages) {
      try {
        logger.info(`Trying to fetch transcript with language: ${lang || 'auto-detect'}`);
        
        if (lang) {
          transcriptList = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: lang
          });
        } else {
          transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
        }
        
        if (transcriptList && transcriptList.length > 0) {
          logger.info(`Successfully fetched transcript with language: ${lang || 'auto-detect'}`);
          break;
        }
      } catch (error) {
        lastError = error;
        logger.info(`Failed to fetch transcript with language ${lang || 'auto-detect'}:`, error instanceof Error ? error.message : String(error));
        continue;
      }
    }

    // If we still don't have a transcript, throw the last error
    if (!transcriptList || transcriptList.length === 0) {
      throw lastError || new Error('No transcript found after trying all language options');
    }

    // Process the transcript
    const transcriptText = transcriptList.map(item => item.text).join(' ').trim();
    
    logger.info('Raw transcript fetched', {
      itemCount: transcriptList.length,
      textLength: transcriptText.length,
      firstItems: transcriptList.slice(0, 3).map(item => item.text)
    });
    
    // Check if the transcript text is meaningful
    if (!transcriptText || transcriptText.length < 50) {
      throw new Error(`Transcript too short: only ${transcriptText.length} characters`);
    }

    // Extract title from transcript - try to get a meaningful title
    let title = 'YouTube Video Summary';
    try {
      const firstFewLines = transcriptList.slice(0, 10).map(item => item.text).join(' ');
      const sentences = firstFewLines.split(/[.!?]+/);
      
      for (const sentence of sentences) {
        const cleanSentence = sentence.trim();
        if (cleanSentence.length > 20 && cleanSentence.length < 100) {
          title = cleanSentence;
          break;
        }
      }
    } catch (titleError) {
      logger.info('Could not extract title from transcript, using default');
    }

    logger.info('Successfully processed YouTube transcript', {
      title,
      itemsCount: transcriptList.length,
      transcriptLength: transcriptText.length,
      firstChars: transcriptText.substring(0, 100)
    });

    return {
      transcript: transcriptText,
      source: 'youtube',
      title
    };
    
  } catch (error) {
    // Enhanced error logging
    const errorDetails = {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      videoId,
      errorType: typeof error,
      errorKeys: error && typeof error === 'object' ? Object.keys(error) : []
    };
    
    logger.error('Failed to get transcript - detailed error:', errorDetails);
    
    // Try to provide more specific error messages
    let errorMessage = 'This video doesn\'t have transcripts available.';
    
    if (error instanceof Error) {
      if (error.message.includes('Could not retrieve a transcript')) {
        errorMessage = 'No transcripts found for this video. The video may not have captions enabled.';
      } else if (error.message.includes('unavailable')) {
        errorMessage = 'This video is unavailable or private.';
      } else if (error.message.includes('disabled')) {
        errorMessage = 'Transcripts are disabled for this video.';
      } else if (error.message.includes('age')) {
        errorMessage = 'This video is age-restricted and transcripts cannot be fetched.';
      }
    }
    
    throw new Error(`Failed to process video: ${errorMessage} Please try a different video with captions/subtitles enabled.`);
  }
}

export async function GET(req: Request) {
  return NextResponse.json({
    gemini: !!process.env.GEMINI_API_KEY
  });
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  let isWriterClosed = false;

  const writeProgress = async (data: any) => {
    if (!isWriterClosed) {
      await writer.write(encoder.encode(JSON.stringify(data) + '\n'));
    }
  };

  const closeWriter = async () => {
    if (!isWriterClosed) {
      isWriterClosed = true;
      await writer.close().catch((closeError) => {
        logger.error('Failed to close writer:', closeError);
      });
    }
  };

  (async () => {
    try {
      const { url, language } = await req.json();
      const videoId = extractVideoId(url);
      const mode = "video"; // Always use video mode

      logger.info('Processing video request', {
        videoId,
        language,
        mode: 'video',
        aiModel: 'gemini'
      });

      logger.info('Using Google Gemini model for generation...');

      // Check cache first
      const { data: existingSummary } = await supabase
        .from('summaries')
        .select('*')
        .eq('video_id', videoId)
        .eq('language', language)
        .single();

      if (existingSummary) {
        await writeProgress({
          type: 'complete',
          summary: existingSummary.content,
          source: 'cache',
          status: 'completed'
        });
        await closeWriter();
        return;
      }

      // Get transcript
      await writeProgress({
        type: 'progress',
        currentChunk: 0,
        totalChunks: 1,
        stage: 'analyzing',
        message: 'Fetching video transcript...'
      });

      const { transcript, source, title } = await getTranscript(videoId);
      
      // Add debugging for transcript
      logger.info('Transcript retrieved successfully', {
        transcriptLength: transcript.length,
        firstChars: transcript.substring(0, 200),
        title
      });

      // For shorter transcripts, process directly without chunking
      if (transcript.length < 8000) {
        logger.info('Processing short transcript directly');
        
        await writeProgress({
          type: 'progress',
          currentChunk: 1,
          totalChunks: 1,
          stage: 'processing',
          message: 'Processing video content...'
        });

        const finalPrompt = createSummaryPrompt(transcript, language);
        
        logger.debug('Final prompt being sent to AI', {
          promptLength: finalPrompt.length,
          promptPreview: finalPrompt.substring(0, 500)
        });

        const summary = await geminiModel.generateContent(finalPrompt);
        
        logger.info('AI summary generated', {
          summaryLength: summary.length,
          summaryPreview: summary.substring(0, 200)
        });

        if (!summary || summary.length < 50) {
          throw new Error('AI generated an empty or very short summary');
        }

        // Save to database and return
        await writeProgress({
          type: 'progress',
          currentChunk: 1,
          totalChunks: 1,
          stage: 'saving',
          message: 'Saving summary to history...'
        });

        try {
          const { data, error } = await supabase
            .from('summaries')
            .insert({
              video_id: videoId,
              title,
              content: summary,
              language,
              mode: "video", // Always video mode
              source
            })
            .select()
            .single();
            
          if (error) throw error;

          await writeProgress({
            type: 'complete',
            summary: summary,
            source: source || 'youtube',
            status: 'completed'
          });
        } catch (dbError: any) {
          console.warn('Warning: Failed to save to database -', dbError?.message);
          await writeProgress({
            type: 'complete',
            summary: summary,
            source: source || 'youtube',
            status: 'completed',
            warning: 'Failed to save to history'
          });
        }
        
        await closeWriter();
        return;
      }

      // For longer transcripts, process in chunks
      const chunks = await splitTranscriptIntoChunks(transcript);
      const totalChunks = chunks.length;
      const intermediateSummaries = [];

      for (let i = 0; i < chunks.length; i++) {
        await writeProgress({
          type: 'progress',
          currentChunk: i + 1,
          totalChunks,
          stage: 'processing',
          message: `Processing section ${i + 1} of ${totalChunks}...`
        });

        const prompt = `Summarize this section of a YouTube video transcript. Focus on the main points, key information, and important details. Keep the original meaning and context.

Content to summarize:
${chunks[i]}

Provide a clear, comprehensive summary in ${language}.`;

        const text = await geminiModel.generateContent(prompt);
        intermediateSummaries.push(text);
      }

      // Generate final summary
      await writeProgress({
        type: 'progress',
        currentChunk: totalChunks,
        totalChunks,
        stage: 'finalizing',
        message: 'Creating final summary...'
      });

      const combinedSummary = intermediateSummaries.join('\n\n');
      const finalPrompt = createSummaryPrompt(combinedSummary, language);
      const summary = await geminiModel.generateContent(finalPrompt);

      if (!summary || summary.length < 50) {
        throw new Error('AI generated an empty or very short summary');
      }

      // Save to database
      await writeProgress({
        type: 'progress',
        currentChunk: totalChunks,
        totalChunks,
        stage: 'saving',
        message: 'Saving summary to history...'
      });

      try {
        const { data: existingSummary } = await supabase
          .from('summaries')
          .select('*')
          .eq('video_id', videoId)
          .eq('language', language)
          .single();

        let savedSummary;
        if (existingSummary) {
          const { data, error } = await supabase
            .from('summaries')
            .update({
              content: summary,
              mode: "video", // Always video mode
              source,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingSummary.id)
            .select()
            .single();
            
          if (error) throw error;
          savedSummary = data;
        } else {
          const { data, error } = await supabase
            .from('summaries')
            .insert({
              video_id: videoId,
              title,
              content: summary,
              language,
              mode: "video", // Always video mode
              source
            })
            .select()
            .single();
            
          if (error) throw error;
          savedSummary = data;
        }

        await writeProgress({
          type: 'complete',
          summary: savedSummary.content,
          source: savedSummary.source || 'youtube',
          status: 'completed'
        });
      } catch (dbError: any) {
        console.warn('Warning: Failed to save to database -', dbError?.message);
        await writeProgress({
          type: 'complete',
          summary,
          source: source || 'youtube',
          status: 'completed',
          warning: 'Failed to save to history'
        });
      }

    } catch (error: any) {
      logger.error('Error processing video:', {
        error,
        stack: error?.stack,
        cause: error?.cause
      });

      await writeProgress({
        type: 'error',
        error: error?.message || 'Failed to process video',
        details: error?.toString() || 'Unknown error'
      }).catch((writeError) => {
        logger.error('Failed to write error progress:', writeError);
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
}