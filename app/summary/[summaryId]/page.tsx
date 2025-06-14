"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileVideo, Subtitles, Archive } from "lucide-react"
import { use } from "react"
import ReactMarkdown from 'react-markdown'
import { supabase } from "@/lib/supabase"

interface Summary {
  id: string
  title: string
  video_url: string
  summary: string
  transcript: string
  language: string
  ai_model: string
  video_duration: number
  created_at: string
}

interface PageProps {
  params: Promise<{ summaryId: string }>
}

export default function SummaryPage({ params }: PageProps) {
  const [summaryData, setSummaryData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { summaryId } = use(params)

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true)
        setError(null)

        // Extract the actual ID from the summaryId (remove 'video_' prefix if present)
        const actualId = summaryId.startsWith('video_') ? summaryId.replace('video_', '') : summaryId

        const { data, error: dbError } = await supabase
          .from('summaries')
          .select('*')
          .eq('id', actualId)
          .single()

        if (dbError) {
          throw new Error(dbError.message)
        }

        if (!data) {
          throw new Error('Summary not found')
        }

        setSummaryData(data)
      } catch (err) {
        console.error("Error fetching summary:", err)
        setError(err instanceof Error ? err.message : "An error occurred while loading the summary")
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [summaryId])

  const getSourceIcon = () => {
    if (summaryData?.video_url.startsWith('local://') || summaryData?.video_url.startsWith('s3://')) {
      return <FileVideo className="h-4 w-4" />
    } else if (summaryData?.video_url.includes('youtube.com')) {
      return <Subtitles className="h-4 w-4" />
    }
    return <Archive className="h-4 w-4" />
  }

  const getSourceDisplay = () => {
    if (summaryData?.video_url.startsWith('local://')) {
      return "Uploaded video file"
    } else if (summaryData?.video_url.startsWith('s3://')) {
      return "Uploaded video (S3)"
    } else if (summaryData?.video_url.includes('youtube.com')) {
      return "YouTube video"
    }
    return "Video source"
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "Unknown duration"
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Loading Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive">Error Loading Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!summaryData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">Summary Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">The requested summary could not be found.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span className="text-2xl font-bold flex items-center">
              <FileVideo className="mr-2" />
              Video Summary
            </span>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">{summaryData.language.toUpperCase()}</Badge>
              <Badge variant="outline">Gemini AI</Badge>
              {getSourceIcon() && (
                <Badge variant="outline" className="flex items-center gap-1">
                  {getSourceIcon()}
                  {getSourceDisplay()}
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Video Information */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h3 className="text-lg font-semibold">{summaryData.title}</h3>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Created: {formatDate(summaryData.created_at)}</span>
              {summaryData.video_duration > 0 && (
                <span>Duration: {formatDuration(summaryData.video_duration)}</span>
              )}
              <span>Model: {summaryData.ai_model}</span>
            </div>
          </div>

          {/* Summary Content */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">AI Summary</h3>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{summaryData.summary}</ReactMarkdown>
            </div>
          </div>

          {/* Transcript Section */}
          {summaryData.transcript && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Full Transcript</h3>
              <Card>
                <CardContent className="p-4">
                  <div className="max-h-64 overflow-y-auto text-sm text-muted-foreground">
                    <p className="whitespace-pre-wrap">{summaryData.transcript}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 