import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// Database types for TypeScript
export interface Summary {
  id: string
  videoId: string
  title: string
  content: string
  language: string
  mode: string
  source?: string
  createdAt: string
  updatedAt: string
} 