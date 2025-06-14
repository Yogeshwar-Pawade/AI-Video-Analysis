-- Chat Migration Script
-- Run this in your Supabase SQL Editor to add chat functionality

-- Chat conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  summary_id TEXT NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for chat tables
CREATE INDEX IF NOT EXISTS idx_chat_conversations_summary_id ON chat_conversations(summary_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at ON chat_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at ASC);

-- Create trigger to auto-update updated_at for chat_conversations
-- (assuming the update_updated_at_column function already exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chat_conversations_updated_at') THEN
        CREATE TRIGGER update_chat_conversations_updated_at 
            BEFORE UPDATE ON chat_conversations 
            FOR EACH ROW 
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Enable Row Level Security (RLS)
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations for now (adjust for production)
DROP POLICY IF EXISTS "Allow all operations on chat_conversations" ON chat_conversations;
CREATE POLICY "Allow all operations on chat_conversations" ON chat_conversations
FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all operations on chat_messages" ON chat_messages;
CREATE POLICY "Allow all operations on chat_messages" ON chat_messages
FOR ALL USING (true);

-- Verify tables were created
SELECT 'Chat tables created successfully!' as status; 