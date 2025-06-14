import re
from typing import Dict, Any

def extract_video_id(youtube_url: str) -> str:
    """Extract video ID from various YouTube URL formats"""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',      # Standard and shared URLs
        r'(?:embed\/)([0-9A-Za-z_-]{11})',       # Embed URLs
        r'(?:youtu\.be\/)([0-9A-Za-z_-]{11})',   # Shortened URLs
        r'(?:shorts\/)([0-9A-Za-z_-]{11})',      # YouTube Shorts
        r'^([0-9A-Za-z_-]{11})$'                 # Just the video ID
    ]

    url = youtube_url.strip()

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    raise ValueError("Could not extract video ID from URL")

AVAILABLE_LANGUAGES = {
    'English': 'en'
}

def create_summary_prompt(text: str, target_language: str) -> str:
    """Create summary prompt for different languages"""
    language_prompts = {
        'en': {
            'title': 'TITLE',
            'overview': 'OVERVIEW',
            'key_points': 'KEY POINTS',
            'takeaways': 'MAIN TAKEAWAYS',
            'context': 'CONTEXT & IMPLICATIONS'
        },
        'de': {
            'title': 'TITEL',
            'overview': 'ÜBERBLICK',
            'key_points': 'KERNPUNKTE',
            'takeaways': 'HAUPTERKENNTNISSE',
            'context': 'KONTEXT & AUSWIRKUNGEN'
        }
    }

    prompts = language_prompts.get(target_language, language_prompts['en'])

    return f"""You are an expert content summarizer. Create a comprehensive summary of the following YouTube video content. Do not include any meta-commentary, introductions, or instructions in your response - provide only the summary content.

Content to summarize:
{text}

Format your response exactly as follows:

🎯 {prompts['title']}: [Create a descriptive title based on the actual content]

📝 {prompts['overview']}: [2-3 sentences providing brief context and main purpose of the content]

🔑 {prompts['key_points']}:
• [Main argument or topic 1 with specific examples]
• [Main argument or topic 2 with specific examples]
• [Main argument or topic 3 with specific examples]
• [Additional key points as needed]

💡 {prompts['takeaways']}:
• [Practical insight 1 and its significance]
• [Practical insight 2 and its significance]
• [Practical insight 3 and its significance]

🔄 {prompts['context']}: [Broader context discussion and future implications]

Use the language: {target_language}""" 