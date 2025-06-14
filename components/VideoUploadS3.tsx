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
  isProcessingComplete: boolean
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
    isProcessingComplete: false,
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

      // Upload with real-time progress using XMLHttpRequest
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100)
            setUploadState(prev => ({ 
              ...prev, 
              uploadProgress: percentComplete 
            }))
            onProgress(percentComplete)
          }
        })

        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            // First show processing complete loading
            setUploadState(prev => ({ 
              ...prev, 
              uploadProgress: 100,
              isProcessingComplete: true,
              s3Key: key
            }))
            onProgress(100)
            
            // After a brief delay, show upload complete
            setTimeout(() => {
              setUploadState(prev => ({ 
                ...prev, 
                isProcessingComplete: false,
                uploadComplete: true
              }))
            }, 1500) // 1.5 second delay
            
            resolve(key)
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status}`))
          }
        })

        // Handle errors
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed due to network error'))
        })

        // Handle abort
        xhr.addEventListener('abort', () => {
          reject(new Error('Upload was aborted'))
        })

        // Start upload
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

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
      isProcessingComplete: false,
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
      isProcessingComplete: false,
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
    <div className="space-y-6">
      {/* Upload Area */}
      {!uploadState.file && (
        <Card className={`border-2 border-dashed rounded-2xl transition-all duration-300 ${
          isDragActive 
            ? 'border-blue-400 bg-blue-50/50 shadow-lg scale-[1.02]' 
            : 'border-slate-300 hover:border-slate-400 hover:shadow-md'
        }`}>
          <CardContent className="p-12">
            <div
              {...getRootProps()}
              className={`cursor-pointer text-center space-y-6 transition-colors ${
                isDragActive ? 'text-blue-600' : 'text-slate-600'
              }`}
            >
              <input {...getInputProps()} />
              <div className={`mx-auto w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                isDragActive 
                  ? 'bg-blue-100 text-blue-600 scale-110' 
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
                <Cloud className="w-10 h-10" />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-slate-900">
                  {isDragActive ? 'Drop your video here' : 'Upload Video File'}
                </h3>
                <p className="text-slate-600 text-lg">
                  Drag and drop your video file here, or{' '}
                  <span className="text-blue-600 font-medium hover:text-blue-700 transition-colors">browse from device</span>
                </p>
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                  <div className="flex items-center justify-center gap-6 flex-wrap">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      Secure S3 Upload
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      Max {maxDuration} minutes
                    </span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      Up to 500MB
                    </span>
                  </div>
                  <p className="text-center mt-3 text-xs text-slate-500">
                    Supports MP4, AVI, MOV, MKV, WebM, WMV, FLV
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Loading */}
      {uploadState.isValidating && (
        <Card className="border border-blue-200 bg-blue-50/50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
              </div>
              <div>
                <p className="font-medium text-slate-900">Validating video file</p>
                <p className="text-sm text-slate-600">Checking format, size, and duration...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Error */}
      {uploadState.validationError && (
        <Card className="border border-red-200 bg-red-50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-red-900">Upload Error</p>
                <p className="text-sm text-red-700 mt-1">{uploadState.validationError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simple Upload Loading UI */}
      {uploadState.isUploading && (
        <Card className="border border-blue-200 bg-blue-50/50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
              </div>
              <div>
                <p className="font-medium text-slate-900">Uploading video...</p>
                <p className="text-sm text-slate-600">Please wait a moment</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Complete Loading */}
      {uploadState.isProcessingComplete && (
        <Card className="border border-blue-200 bg-blue-50/50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
              </div>
              <div>
                <p className="font-medium text-slate-900">Processing upload...</p>
                <p className="text-sm text-slate-600">Finalizing your video</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Selected (Not Uploading) */}
      {uploadState.file && !uploadState.validationError && !uploadState.isUploading && !uploadState.isProcessingComplete && !uploadState.uploadComplete && (
        <Card className="border-0 bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                  <FileVideo className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900 truncate max-w-[250px]">
                    {uploadState.file.name}
                  </p>
                  <p className="text-sm text-slate-600">
                    {formatFileSize(uploadState.file.size)}
                  </p>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={removeFile}
                className="h-10 w-10 p-0 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Complete */}
      {uploadState.uploadComplete && (
        <Card className="border border-green-200 bg-green-50/50 rounded-2xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-green-900">Upload Complete!</p>
                  <p className="text-sm text-green-700">
                    {uploadState.file?.name} - Ready for AI processing
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-green-700">Ready</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 