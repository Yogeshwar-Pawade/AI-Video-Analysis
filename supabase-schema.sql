-- Updated schema for S3 video uploads
CREATE TABLE summaries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  summary TEXT NOT NULL,
  transcript TEXT,
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

-- Enable Row Level Security (RLS)
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for now (adjust for production)
CREATE POLICY "Allow all operations on summaries" ON summaries
FOR ALL USING (true); 