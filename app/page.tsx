"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VideoUploadS3 } from "@/components/VideoUploadS3"
import { Progress } from "@/components/ui/progress"

export default function Home() {
  const [s3Key, setS3Key] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleVideoUploaded = (uploadedS3Key: string, uploadedFileName: string) => {
    setS3Key(uploadedS3Key)
    setFileName(uploadedFileName)
    setError(null)
  }

  const handleUploadProgress = (progress: number) => {
    setProgress(progress)
  }

  const processS3Video = async () => {
    if (!s3Key || !fileName) return

    setIsProcessing(true)
    setProgress(0)
    setError(null)

    try {
      const response = await fetch('/api/process-s3-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          s3Key,
          fileName,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to process S3 video')
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
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'progress') {
                setProgress(data.progress)
                setProgressMessage(data.message)
              } else if (data.type === 'complete') {
                setProgress(100)
                setProgressMessage(data.message)
                // Navigate to summary page
                setTimeout(() => {
                  router.push(`/summary/${data.summaryId}`)
                }, 1000)
              } else if (data.type === 'error') {
                throw new Error(data.message)
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError)
            }
          }
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to process S3 video')
      setProgress(0)
      setProgressMessage("")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center">AI Video Summarizer</CardTitle>
          <CardDescription className="text-center">
            Upload a video file to get an AI-generated summary powered by Gemini
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Video Upload */}
          <VideoUploadS3
            onVideoUploaded={handleVideoUploaded}
            onProgress={handleUploadProgress}
            maxDuration={30}
          />

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
                <div className="text-destructive text-sm">
                  <strong>Error:</strong> {error}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info Badge */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>English • Powered by Gemini AI • Max 30 minutes</span>
          </div>

          {/* Generate Summary Button */}
          <Button 
            onClick={processS3Video}
            className="w-full" 
            size="lg"
            disabled={!s3Key || isProcessing}
          >
            {isProcessing ? "Processing..." : "Generate Summary"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

