"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Upload, FileVideo, X, AlertCircle } from "lucide-react"

interface VideoUploadProps {
  onVideoReady: (file: File) => void
  onProgress: (progress: number) => void
  maxDuration?: number // in minutes
}

export function VideoUpload({ onVideoReady, onProgress, maxDuration = 30 }: VideoUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  const validateVideoFile = async (file: File): Promise<boolean> => {
    setIsValidating(true)
    setValidationError(null)

    try {
      // Check file type
      if (!file.type.startsWith('video/')) {
        throw new Error('Please select a valid video file')
      }

      // Check file size (limit to ~500MB for 30min video)
      const maxSize = 500 * 1024 * 1024 // 500MB
      if (file.size > maxSize) {
        throw new Error('File size too large. Please select a video under 500MB')
      }

      // Check video duration using video element
      const videoDuration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        
        video.onloadedmetadata = () => {
          resolve(video.duration)
        }
        
        video.onerror = () => {
          reject(new Error('Could not read video metadata'))
        }
        
        video.src = URL.createObjectURL(file)
      })

      const durationMinutes = videoDuration / 60
      if (durationMinutes > maxDuration) {
        throw new Error(`Video duration (${Math.round(durationMinutes)} minutes) exceeds the ${maxDuration} minute limit`)
      }

      return true
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Invalid video file')
      return false
    } finally {
      setIsValidating(false)
    }
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    const isValid = await validateVideoFile(file)
    if (isValid) {
      setUploadedFile(file)
      setUploadProgress(100)
      onProgress(100)
      onVideoReady(file)
    }
  }, [maxDuration, onVideoReady, onProgress])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.wmv', '.flv']
    },
    multiple: false,
    maxSize: 500 * 1024 * 1024 // 500MB
  })

  const removeFile = () => {
    setUploadedFile(null)
    setUploadProgress(0)
    setValidationError(null)
    onProgress(0)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-4">
      {!uploadedFile && (
        <Card className="border-2 border-dashed transition-colors">
          <CardContent className="p-8">
            <div
              {...getRootProps()}
              className={`cursor-pointer text-center space-y-4 ${
                isDragActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <input {...getInputProps()} />
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-foreground">
                  {isDragActive ? 'Drop your video here' : 'Upload a video file'}
                </h3>
                <p className="text-sm">
                  Drag and drop your video file here, or{' '}
                  <span className="text-primary font-medium">browse from device</span>
                </p>
                <p className="text-xs">
                  Supports MP4, AVI, MOV, MKV, WebM, WMV, FLV (max {maxDuration} minutes, 500MB)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isValidating && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm">Validating video file...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {validationError && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{validationError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {uploadedFile && !validationError && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileVideo className="w-8 h-8 text-primary" />
                  <div>
                    <p className="text-sm font-medium truncate max-w-[200px]">
                      {uploadedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(uploadedFile.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
              
              {uploadProgress === 100 && (
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>File ready for processing</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 