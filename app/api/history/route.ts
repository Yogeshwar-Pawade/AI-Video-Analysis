import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

function extractTitleFromContent(content: string): string {
  try {
    const lines = content.split('\n');
    // Look for title in different formats
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('🎯 TITLE:') ||
          trimmedLine.startsWith('🎯 TITEL:') ||
          trimmedLine.startsWith('🎙️ TITLE:') ||
          trimmedLine.startsWith('🎙️ TITEL:')) {
        const title = trimmedLine.split(':')[1].trim();
        if (title) return title;
      }
    }
    // Fallback: Use first non-empty line if no title marker found
    const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
    if (firstNonEmptyLine) {
      return firstNonEmptyLine.trim().replace(/^[🎯🎙️]\s*/, '');
    }
  } catch (error) {
    console.error('Error extracting title:', error);
  }
  return 'Untitled Summary';
}

export async function GET() {
  try {
    const { data: summaries, error } = await supabase
      .from('summaries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch summaries' },
        { status: 500 }
      );
    }

    const processedSummaries = summaries?.map(summary => ({
      id: summary.id,
      videoId: summary.video_id,
      title: summary.title, // Direct title field
      content: summary.summary, // Map summary to content for compatibility
      transcript: summary.transcript, // Include transcript
      language: summary.language,
      mode: summary.video_url?.startsWith('s3://') ? 'video' : 'youtube', // Infer mode from URL
      source: summary.video_url?.startsWith('s3://') ? 'upload' : 'youtube', // Infer source from URL
      createdAt: summary.created_at,
      updatedAt: summary.updated_at
    })) || [];

    return NextResponse.json({ summaries: processedSummaries });
  } catch (error) {
    console.error('Error fetching summaries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summaries' },
      { status: 500 }
    );
  }
}