"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VideoUploadS3 } from "@/components/VideoUploadS3"
import { YouTubeSummarizer } from "@/components/YouTubeSummarizer"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Youtube, Upload, FileVideo, History } from "lucide-react"
import { getApiUrl, API_CONFIG } from "@/lib/config"
import Link from "next/link"

export default function Home() {
  const [s3Key, setS3Key] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("youtube")
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
      const response = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.PROCESS_S3_VIDEO), {
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

  const handleYouTubeSummaryComplete = (summaryId: string) => {
    router.push(`/summary/${summaryId}`)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">AI Video Summarizer</h1>
            <Link href="/history">
              <Button variant="outline" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                View History
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold mb-4">
              Transform Videos into Insights
            </h2>
            <p className="text-xl text-muted-foreground mb-6">
              Get AI-powered summaries from YouTube videos or upload your own files. 
              Powered by Google Gemini for accurate and comprehensive analysis.
            </p>
          </div>

          {/* Video Processing Options */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="youtube" className="flex items-center gap-2">
                <Youtube className="h-4 w-4" />
                YouTube URL
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload Video
              </TabsTrigger>
            </TabsList>

            {/* YouTube Summarization Tab */}
            <TabsContent value="youtube" className="mt-6">
              <YouTubeSummarizer onSummaryComplete={handleYouTubeSummaryComplete} />
            </TabsContent>

            {/* Video Upload Tab */}
            <TabsContent value="upload" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileVideo className="h-5 w-5" />
                    Upload Video File
                  </CardTitle>
                  <CardDescription>
                    Upload your video file to AWS S3 and get an AI-generated summary
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
                    <span>Secure S3 upload • Max 30 minutes • Powered by Gemini AI</span>
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
            </TabsContent>
          </Tabs>

          {/* Features Section */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 text-center">
                <Youtube className="h-8 w-8 mx-auto mb-3 text-red-500" />
                <h3 className="font-semibold mb-2">YouTube Integration</h3>
                <p className="text-sm text-muted-foreground">
                  Extract transcripts and generate summaries from any public YouTube video
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <Upload className="h-8 w-8 mx-auto mb-3 text-blue-500" />
                <h3 className="font-semibold mb-2">Secure Upload</h3>
                <p className="text-sm text-muted-foreground">
                  Upload videos securely to AWS S3 with support for multiple formats
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <FileVideo className="h-8 w-8 mx-auto mb-3 text-green-500" />
                <h3 className="font-semibold mb-2">AI-Powered Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Get comprehensive summaries powered by Google's Gemini AI model
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

