"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileVideo, MessageSquare, ArrowLeft, Sparkles, Clock, Globe } from "lucide-react"
import { use } from "react"
import ReactMarkdown from 'react-markdown'
import { supabase } from "@/lib/supabase"
import Link from "next/link"

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/80 border-b border-slate-200/60 sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-slate-900">Video Summary</h1>
              </div>
              <Link href="/">
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl px-4 py-2 transition-all duration-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <Card className="border-0 shadow-xl bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200/60 p-8">
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-slate-200 rounded-lg w-3/4"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-slate-200 rounded-full w-20"></div>
                    <div className="h-6 bg-slate-200 rounded-full w-24"></div>
                    <div className="h-6 bg-slate-200 rounded-full w-28"></div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="animate-pulse space-y-6">
                  <div className="space-y-3">
                    <div className="h-6 bg-slate-200 rounded-lg w-32"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-slate-200 rounded-lg w-full"></div>
                      <div className="h-4 bg-slate-200 rounded-lg w-full"></div>
                      <div className="h-4 bg-slate-200 rounded-lg w-3/4"></div>
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

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/80 border-b border-slate-200/60 sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-slate-900">Video Summary</h1>
              </div>
              <Link href="/">
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl px-4 py-2 transition-all duration-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <Card className="border border-red-200 bg-red-50 rounded-2xl">
              <CardContent className="p-8">
                <div className="text-red-700 text-center">
                  <strong>Error:</strong> {error}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  if (!summaryData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        {/* Header */}
        <header className="backdrop-blur-xl bg-white/80 border-b border-slate-200/60 sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-slate-900">Video Summary</h1>
              </div>
              <Link href="/">
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl px-4 py-2 transition-all duration-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <Card className="border border-slate-200 bg-slate-50 rounded-2xl">
              <CardContent className="p-8">
                <div className="text-slate-700 text-center">
                  <strong>Not Found:</strong> The requested summary could not be found.
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="backdrop-blur-xl bg-white/80 border-b border-slate-200/60 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-slate-900">Video Summary</h1>
            </div>
            <Link href="/">
              <Button 
                variant="ghost" 
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-xl px-4 py-2 transition-all duration-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Title Card */}
          <Card className="border-0 shadow-xl bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200/60 p-8">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <FileVideo className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1 space-y-4">
                  <CardTitle className="text-3xl font-bold text-slate-900 leading-tight">
                    {summaryData.title}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-0 rounded-full px-4 py-2 flex items-center gap-2">
                      <Globe className="h-3 w-3" />
                      {summaryData.language.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-4 py-2 border-slate-200 text-slate-600 flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {formatDate(summaryData.created_at)}
                    </Badge>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-0 rounded-full px-4 py-2 flex items-center gap-2">
                      <FileVideo className="h-3 w-3" />
                      Uploaded Video
                    </Badge>
                    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-0 rounded-full px-4 py-2">
                      {summaryData.ai_model}
                    </Badge>
                  </div>
                  {summaryData.video_duration > 0 && (
                    <p className="text-slate-600">
                      Duration: {formatDuration(summaryData.video_duration)}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Summary Content */}
          <Card className="border-0 shadow-xl bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200/60 p-8">
              <CardTitle className="flex items-center gap-3 text-2xl text-slate-900">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              <div className="prose prose-lg max-w-none">
                <ReactMarkdown>{summaryData.summary}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>

          {/* Transcript Section */}
          {summaryData.transcript && (
            <Card className="border-0 shadow-xl bg-white/70 backdrop-blur-sm rounded-3xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200/60 p-8">
                <CardTitle className="flex items-center gap-3 text-2xl text-slate-900">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-white" />
                  </div>
                  Full Transcript
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                  <div className="max-h-96 overflow-y-auto">
                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                      {summaryData.transcript}
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