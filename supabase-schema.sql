-- Updated schema for S3 video uploads
CREATE TABLE summaries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  summary TEXT NOT NULL,
  transcript TEXT,
  analysis JSONB, -- Store video analysis results as JSON
  language TEXT NOT NULL DEFAULT 'en',
  ai_model TEXT NOT NULL DEFAULT 'gemini-2.0-flash-001',
  video_duration INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Create unique constraint for video_id and language combination
  UNIQUE(video_id, language)
);

-- Create an index for better query performance
CREATE INDEX idx_summaries_video_id ON summaries(video_id);
CREATE INDEX idx_summaries_created_at ON summaries(created_at DESC);
CREATE INDEX idx_summaries_video_url ON summaries(video_url);

-- Chat conversations table
CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  summary_id TEXT NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for chat tables
CREATE INDEX idx_chat_conversations_summary_id ON chat_conversations(summary_id);
CREATE INDEX idx_chat_conversations_created_at ON chat_conversations(created_at DESC);
CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at ASC);

-- Create a function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_summaries_updated_at 
    BEFORE UPDATE ON summaries 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_conversations_updated_at 
    BEFORE UPDATE ON chat_conversations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for now (adjust for production)
CREATE POLICY "Allow all operations on summaries" ON summaries
FOR ALL USING (true);

CREATE POLICY "Allow all operations on chat_conversations" ON chat_conversations
FOR ALL USING (true);

CREATE POLICY "Allow all operations on chat_messages" ON chat_messages
FOR ALL USING (true);

-- Add analysis column to summaries table
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS analysis JSONB;

-- Create index for analysis column
CREATE INDEX IF NOT EXISTS idx_summaries_analysis ON summaries USING GIN (analysis); 