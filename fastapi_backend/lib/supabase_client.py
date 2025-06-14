from supabase import create_client, Client
import os
from typing import Dict, Any, Optional
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Supabase configuration
supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

# Initialize Supabase client with error handling
supabase: Optional[Client] = None

try:
    if supabase_url and supabase_key and not supabase_url.startswith('your_') and not supabase_key.startswith('your_'):
        # Only create client if we have valid-looking URLs and keys
        if supabase_url.startswith('http') and len(supabase_key) > 20:
            supabase = create_client(supabase_url, supabase_key)
            print("✅ Supabase client initialized successfully")
        else:
            print("⚠️  Supabase configuration appears invalid - client not initialized")
    else:
        print("⚠️  Supabase environment variables not configured - client not initialized")
except Exception as e:
    print(f"⚠️  Failed to initialize Supabase client: {e}")
    supabase = None

# Database types for TypeScript compatibility
class Summary:
    def __init__(self, data: Dict[str, Any]):
        self.id = data.get('id')
        self.video_id = data.get('video_id')
        self.title = data.get('title')
        self.video_url = data.get('video_url')
        self.summary = data.get('summary')
        self.transcript = data.get('transcript')
        self.language = data.get('language', 'en')
        self.ai_model = data.get('ai_model')
        self.video_duration = data.get('video_duration', 0)
        self.created_at = data.get('created_at')
        self.updated_at = data.get('updated_at')

def extract_title_from_content(content: str) -> str:
    """Extract title from summary content, similar to the TypeScript version"""
    try:
        lines = content.split('\n')
        # Look for title in different formats
        for line in lines:
            trimmed_line = line.strip()
            if (trimmed_line.startswith('🎯 TITLE:') or 
                trimmed_line.startswith('🎯 TITEL:') or
                trimmed_line.startswith('🎙️ TITLE:') or
                trimmed_line.startswith('🎙️ TITEL:')):
                title = trimmed_line.split(':', 1)[1].strip()
                if title:
                    return title
        # Fallback: Use first non-empty line if no title marker found
        for line in lines:
            trimmed_line = line.strip()
            if len(trimmed_line) > 0:
                # Remove emoji prefixes
                import re
                title = re.sub(r'^[🎯🎙️]\s*', '', trimmed_line)
                return title
    except Exception as e:
        print(f"Error extracting title: {e}")
    return 'Untitled Summary' 