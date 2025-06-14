"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Youtube, Globe, AlertCircle, CheckCircle } from "lucide-react"
import { getApiUrl, API_CONFIG } from "@/lib/config"

interface YouTubeSummarizerProps {
  onSummaryComplete?: (summaryId: string) => void
}

export function YouTubeSummarizer({ onSummaryComplete }: YouTubeSummarizerProps) {
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [language, setLanguage] = useState("en")
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isValidUrl, setIsValidUrl] = useState(false)
  const router = useRouter()

  const validateYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^[a-zA-Z0-9_-]{11}$/ // Direct video ID
    ]
    return patterns.some(pattern => pattern.test(url))
  }

  const handleUrlChange = (url: string) => {
    setYoutubeUrl(url)
    setError(null)
    setIsValidUrl(validateYouTubeUrl(url))
  }

  const processYouTubeVideo = async () => {
    if (!youtubeUrl || !isValidUrl) {
      setError("Please enter a valid YouTube URL")
      return
    }

    setIsProcessing(true)
    setProgress(0)
    setError(null)

    try {
      const response = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.SUMMARIZE), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl,
          language: language,
        }),
      })

      if (!response.ok) {
        const errorData = await response.text()
        try {
          const jsonError = JSON.parse(errorData)
          throw new Error(jsonError.detail || jsonError.message || 'Failed to process YouTube video')
        } catch {
          throw new Error('Failed to process YouTube video')
        }
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to read response stream')
      }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line)
              
              if (data.type === 'progress') {
                setProgress(data.progress)
                setProgressMessage(data.message)
              } else if (data.type === 'complete') {
                setProgress(100)
                setProgressMessage(data.message)
                // Navigate to summary page or call callback
                if (onSummaryComplete && data.summaryId) {
                  onSummaryComplete(data.summaryId)
                } else if (data.summaryId) {
                  setTimeout(() => {
                    router.push(`/summary/${data.summaryId}`)
                  }, 1000)
                }
              } else if (data.type === 'error') {
                throw new Error(data.message)
              }
            } catch (parseError) {
              // If it's not JSON, it might be a chunk of a larger JSON object
              console.debug('Non-JSON chunk received:', line)
            }
          }
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to process YouTube video')
      setProgress(0)
      setProgressMessage("")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Youtube className="h-5 w-5 text-red-500" />
          YouTube Video Summarizer
        </CardTitle>
        <CardDescription>
          Enter a YouTube URL to get an AI-generated summary powered by Gemini
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* YouTube URL Input */}
        <div className="space-y-2">
          <label htmlFor="youtube-url" className="text-sm font-medium">
            YouTube URL
          </label>
          <div className="relative">
            <Input
              id="youtube-url"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              className={`${isValidUrl && youtubeUrl ? 'border-green-500' : ''} ${
                error ? 'border-red-500' : ''
              }`}
              disabled={isProcessing}
            />
            {youtubeUrl && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                {isValidUrl ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Supports YouTube watch, shorts, and embed URLs
          </p>
        </div>

        {/* Language Selection */}
        <div className="space-y-2">
          <label htmlFor="language" className="text-sm font-medium">
            Summary Language
          </label>
          <Select value={language} onValueChange={setLanguage} disabled={isProcessing}>
            <SelectTrigger>
              <SelectValue>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  English
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  English
                </div>
              </SelectItem>
              {/* Add more languages as needed */}
            </SelectContent>
          </Select>
        </div>

        {/* Processing Progress */}
        {isProcessing && (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{progressMessage || "Processing..."}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4">
              <div className="text-destructive text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Error:</strong> {error}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Badge */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>AI-powered • Transcript extraction • Multilingual support</span>
        </div>

        {/* Summarize Button */}
        <Button 
          onClick={processYouTubeVideo}
          className="w-full" 
          size="lg"
          disabled={!isValidUrl || !youtubeUrl || isProcessing}
        >
          {isProcessing ? "Processing..." : "Generate Summary"}
        </Button>
      </CardContent>
    </Card>
  )
} 