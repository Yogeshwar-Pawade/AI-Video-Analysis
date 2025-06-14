"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { VideoUploadS3 } from "@/components/VideoUploadS3"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { FileVideo, Zap, MessageSquare, History, Upload, Sparkles } from "lucide-react"
import { getApiUrl, API_CONFIG } from "@/lib/config"
import Link from "next/link"

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
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <FileVideo className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">AI Video Summarizer</h1>
            </div>
            <Link 
              href="/history"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg hover:bg-muted"
            >
              <History className="h-4 w-4" />
              History
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold text-foreground">
              Transform Your Videos into Insights
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Upload any video and get AI-powered summaries, transcripts, and interactive chat to explore the content deeper.
            </p>
          </div>

          {/* Upload Section */}
          <Card className="card-interactive">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Upload className="h-6 w-6 text-primary" />
                Upload Your Video
              </CardTitle>
              <CardDescription>
                Upload a video file to get started with AI-powered analysis
              </CardDescription>
            </CardHeader>
                         <CardContent className="space-y-6">
               <VideoUploadS3
                 onVideoUploaded={handleVideoUploaded}
                 onProgress={handleUploadProgress}
                 maxDuration={30}
               />
               
               {/* Processing Progress */}
               {isProcessing && (
                 <Card className="border-primary/20 bg-primary/5">
                   <CardContent className="p-4">
                     <div className="space-y-3">
                       <div className="flex justify-between text-sm font-medium">
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
                 <Card className="border-destructive/20 bg-destructive/5">
                   <CardContent className="p-4">
                     <div className="text-destructive text-sm">
                       <strong>Error:</strong> {error}
                     </div>
                   </CardContent>
                 </Card>
               )}

               {/* Generate Summary Button */}
               {s3Key && !isProcessing && (
                 <Button 
                   onClick={processS3Video}
                   className="w-full interactive-button" 
                   size="lg"
                 >
                   <Sparkles className="h-4 w-4 mr-2" />
                   Generate Summary
                 </Button>
               )}
             </CardContent>
          </Card>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="card-interactive">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>AI-Powered Summaries</CardTitle>
                <CardDescription>
                  Get concise, intelligent summaries of your video content using advanced AI technology.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="card-interactive">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <FileVideo className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Full Transcripts</CardTitle>
                <CardDescription>
                  Automatically generate accurate transcripts from your video's audio content.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="card-interactive">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Interactive Chat</CardTitle>
                <CardDescription>
                  Ask questions and get detailed answers about your video content through AI chat.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* How it Works */}
          <Card>
            <CardHeader>
              <CardTitle>How It Works</CardTitle>
              <CardDescription>Simple steps to get insights from your videos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-2xl font-bold text-primary">1</span>
                  </div>
                  <h3 className="font-semibold">Upload Video</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload your video file using our secure upload system
                  </p>
                </div>
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-2xl font-bold text-primary">2</span>
                  </div>
                  <h3 className="font-semibold">AI Analysis</h3>
                  <p className="text-sm text-muted-foreground">
                    Our AI processes your video to generate summaries and transcripts
                  </p>
                </div>
                <div className="text-center space-y-3">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-2xl font-bold text-primary">3</span>
                  </div>
                  <h3 className="font-semibold">Explore & Chat</h3>
                  <p className="text-sm text-muted-foreground">
                    Review insights and chat with AI for deeper understanding
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

