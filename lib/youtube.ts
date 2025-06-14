export function extractVideoId(youtube_url: string): string {
  const patterns = [
    /(?:v=|\/)([0-9A-Za-z_-]{11}).*/,      // Standard and shared URLs
    /(?:embed\/)([0-9A-Za-z_-]{11})/,       // Embed URLs
    /(?:youtu\.be\/)([0-9A-Za-z_-]{11})/,   // Shortened URLs
    /(?:shorts\/)([0-9A-Za-z_-]{11})/,      // YouTube Shorts
    /^([0-9A-Za-z_-]{11})$/                 // Just the video ID
  ];

  const url = youtube_url.trim();

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  throw new Error("Could not extract video ID from URL");
}

export const AVAILABLE_LANGUAGES = {
  'English': 'en'
} as const;

export function createSummaryPrompt(text: string, targetLanguage: string) {
  const languagePrompts = {
    'en': {
      title: 'TITLE',
      overview: 'OVERVIEW',
      keyPoints: 'KEY POINTS',
      takeaways: 'MAIN TAKEAWAYS',
      context: 'CONTEXT & IMPLICATIONS'
    },
    'de': {
      title: 'TITEL',
      overview: 'ÜBERBLICK',
      keyPoints: 'KERNPUNKTE',
      takeaways: 'HAUPTERKENNTNISSE',
      context: 'KONTEXT & AUSWIRKUNGEN'
    }
  };

  const prompts = languagePrompts[targetLanguage as keyof typeof languagePrompts] || languagePrompts.en;

  return `You are an expert content summarizer. Create a comprehensive summary of the following YouTube video content. Do not include any meta-commentary, introductions, or instructions in your response - provide only the summary content.

Content to summarize:
${text}

Format your response exactly as follows:

🎯 ${prompts.title}: [Create a descriptive title based on the actual content]

📝 ${prompts.overview}: [2-3 sentences providing brief context and main purpose of the content]

🔑 ${prompts.keyPoints}:
• [Main argument or topic 1 with specific examples]
• [Main argument or topic 2 with specific examples]
• [Main argument or topic 3 with specific examples]
• [Additional key points as needed]

💡 ${prompts.takeaways}:
• [Practical insight 1 and its significance]
• [Practical insight 2 and its significance]
• [Practical insight 3 and its significance]

🔄 ${prompts.context}: [Broader context discussion and future implications]

Use the language: ${targetLanguage}`;
}