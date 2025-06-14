"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Upload, FileVideo, X, AlertCircle, CheckCircle, Cloud } from "lucide-react"
import { getApiUrl, API_CONFIG } from "@/lib/config"

interface VideoUploadS3Props {
  onVideoUploaded: (s3Key: string, fileName: string) => void
  onProgress: (progress: number) => void
  maxDuration?: number // in minutes
}

interface UploadState {
  file: File | null
  isUploading: boolean
  uploadProgress: number
  isValidating: boolean
  validationError: string | null
  uploadComplete: boolean
  s3Key: string | null
}

export function VideoUploadS3({ onVideoUploaded, onProgress, maxDuration = 30 }: VideoUploadS3Props) {
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    isUploading: false,
    uploadProgress: 0,
    isValidating: false,
    validationError: null,
    uploadComplete: false,
    s3Key: null,
  })

  const validateVideoFile = async (file: File): Promise<boolean> => {
    setUploadState(prev => ({ 
      ...prev, 
      isValidating: true, 
      validationError: null 
    }))

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
          URL.revokeObjectURL(video.src)
        }
        
        video.onerror = () => {
          URL.revokeObjectURL(video.src)
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
      setUploadState(prev => ({
        ...prev,
        validationError: error instanceof Error ? error.message : 'Invalid video file'
      }))
      return false
    } finally {
      setUploadState(prev => ({ ...prev, isValidating: false }))
    }
  }

  const uploadToS3 = async (file: File): Promise<string> => {
    setUploadState(prev => ({ 
      ...prev, 
      isUploading: true, 
      uploadProgress: 0 
    }))

    try {
      // Get presigned URL from our API
      const presignedResponse = await fetch(getApiUrl(API_CONFIG.ENDPOINTS.UPLOAD_PRESIGNED), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      })

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json()
        throw new Error(errorData.message || 'Failed to get upload URL')
      }

      const { uploadUrl, key } = await presignedResponse.json()

      // Upload directly to S3 using PUT method
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        console.error('S3 upload error:', errorText)
        throw new Error('Failed to upload to S3')
      }

      // Update progress to 100%
      setUploadState(prev => ({ 
        ...prev, 
        uploadProgress: 100,
        uploadComplete: true,
        s3Key: key
      }))
      
      onProgress(100)
      return key

    } catch (error) {
      console.error('Upload failed:', error)
      throw new Error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploadState(prev => ({ ...prev, isUploading: false }))
    }
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    // Reset state
    setUploadState({
      file,
      isUploading: false,
      uploadProgress: 0,
      isValidating: false,
      validationError: null,
      uploadComplete: false,
      s3Key: null,
    })

    // Validate file
    const isValid = await validateVideoFile(file)
    if (!isValid) return

    try {
      // Upload to S3
      const s3Key = await uploadToS3(file)
      onVideoUploaded(s3Key, file.name)
    } catch (error) {
      setUploadState(prev => ({
        ...prev,
        validationError: error instanceof Error ? error.message : 'Upload failed'
      }))
    }
  }, [maxDuration, onVideoUploaded, onProgress])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.wmv', '.flv']
    },
    multiple: false,
    maxSize: 500 * 1024 * 1024, // 500MB
    disabled: uploadState.isUploading || uploadState.uploadComplete
  })

  const removeFile = () => {
    setUploadState({
      file: null,
      isUploading: false,
      uploadProgress: 0,
      isValidating: false,
      validationError: null,
      uploadComplete: false,
      s3Key: null,
    })
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
      {/* Upload Area */}
      {!uploadState.file && (
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
                <Cloud className="w-6 h-6" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-foreground">
                  {isDragActive ? 'Drop your video here' : 'Upload to AWS S3'}
                </h3>
                <p className="text-sm">
                  Drag and drop your video file here, or{' '}
                  <span className="text-primary font-medium">browse from device</span>
                </p>
                <p className="text-xs">
                  Reliable multipart upload • Supports MP4, AVI, MOV, MKV, WebM, WMV, FLV 
                  <br />
                  Max {maxDuration} minutes, 500MB
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Loading */}
      {uploadState.isValidating && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm">Validating video file...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Error */}
      {uploadState.validationError && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{uploadState.validationError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Upload Progress */}
      {uploadState.file && !uploadState.validationError && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileVideo className="w-8 h-8 text-primary" />
                  <div>
                    <p className="text-sm font-medium truncate max-w-[200px]">
                      {uploadState.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(uploadState.file.size)}
                    </p>
                  </div>
                </div>
                
                {!uploadState.isUploading && !uploadState.uploadComplete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removeFile}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}

                {uploadState.uploadComplete && (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
              </div>
              
              {/* Upload Progress */}
              {uploadState.isUploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading to AWS S3...</span>
                    <span>{uploadState.uploadProgress}%</span>
                  </div>
                  <Progress value={uploadState.uploadProgress} className="h-2" />
                </div>
              )}
              
              {/* Upload Complete */}
              {uploadState.uploadComplete && (
                <div className="flex items-center space-x-2 text-sm text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Uploaded to S3 successfully - Ready for processing</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 