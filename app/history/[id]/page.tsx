"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
// Language constants
const AVAILABLE_LANGUAGES = {
  'English': 'en'
} as const;
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Clock, Globe, FileVideo, MessageSquare, Bot, MessageCircle } from "lucide-react"
import { use } from "react"
import ReactMarkdown from 'react-markdown'
import { getApiUrl, API_CONFIG } from "@/lib/config"
import { ChatInterface } from "@/components/ChatInterface"

interface Summary {
  id: string
  videoId: string
  title: string
  content: string
  transcript?: string
  language: string
  mode: string
  source: string
  createdAt: string
  updatedAt?: string
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default function HistoryDetailPage({ params }: PageProps) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const router = useRouter()
  const { id } = use(params)

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true)
        setError(null)

        // Since FastAPI backend doesn't have individual summary endpoint,
        // we fetch all summaries and find the one we need
        const response = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.HISTORY))
        if (!response.ok) {
          throw new Error("Failed to fetch summaries")
        }
        const data = await response.json()
        const foundSummary = data.summaries.find((summary: Summary) => summary.id === id)
        
        if (!foundSummary) {
          throw new Error("Summary not found")
        }
        
        setSummary(foundSummary)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load summary")
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [id])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getLanguageDisplay = (code: string) => {
    const entry = Object.entries(AVAILABLE_LANGUAGES).find(([_, langCode]) => langCode === code)
    return entry ? entry[0] : code
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <FileVideo className="h-4 w-4 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-semibold text-foreground">Summary Details</h1>
              </div>
              <Button 
                variant="ghost" 
                onClick={() => router.push("/history")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-muted rounded w-3/4"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-muted rounded w-20"></div>
                    <div className="h-6 bg-muted rounded w-24"></div>
                    <div className="h-6 bg-muted rounded w-28"></div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="animate-pulse space-y-6">
                  <div className="space-y-3">
                    <div className="h-6 bg-muted rounded w-32"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-full"></div>
                      <div className="h-4 bg-muted rounded w-full"></div>
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <FileVideo className="h-4 w-4 text-primary-foreground" />
                </div>
                <h1 className="text-xl font-semibold text-foreground">Summary Details</h1>
              </div>
              <Button 
                variant="ghost" 
                onClick={() => router.push("/history")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-8 text-center">
                <div className="text-destructive">
                  <strong>Error:</strong> {error || "Summary not found"}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  // If chat is active, show full-page chat interface without any headers
  if (showChat) {
    return (
      <div className="h-screen">
        <ChatInterface 
          summaryId={summary.id} 
          summaryTitle={summary.title}
          onBack={() => setShowChat(false)}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <FileVideo className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">Summary Details</h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Chat Redirect Button */}
              <Button 
                onClick={() => setShowChat(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Open Chat
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => router.push("/history")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Title Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileVideo className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 space-y-4">
                  <CardTitle className="text-2xl font-bold text-foreground leading-tight">
                    {summary.title}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {getLanguageDisplay(summary.language)}
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(summary.createdAt)}
                    </Badge>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1">
                      <FileVideo className="h-3 w-3" />
                      Uploaded Video
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Content Layout: Summary → Transcript → Ask Questions */}
          {/* 1. AI Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none">
                <ReactMarkdown>{summary.content}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>

          {/* 2. Full Transcript */}
          {summary.transcript && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Full Transcript
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 border">
                  <div className="max-h-96 overflow-y-auto">
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap font-mono text-sm">
                      {summary.transcript}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

