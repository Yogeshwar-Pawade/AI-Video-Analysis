// API Configuration for FastAPI Backend
export const API_CONFIG = {
  // FastAPI backend URL
  BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  
  // API endpoints
  ENDPOINTS: {
    SUMMARIZE: '/api/summarize',
    PROCESS_VIDEO: '/api/process-video',
    PROCESS_S3_VIDEO: '/api/process-s3-video',
    UPLOAD_PRESIGNED: '/api/upload/presigned',
    HISTORY: '/api/history',
  }
}

// Helper function to build full API URLs
export const getApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`
}

// Helper function for API fetch with proper error handling
export const apiRequest = async (endpoint: string, options?: RequestInit) => {
  const url = getApiUrl(endpoint)
  
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  }

  const response = await fetch(url, defaultOptions)
  
  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.detail || errorData.message || errorMessage
    } catch {
      // If we can't parse JSON, use the default message
    }
    throw new Error(errorMessage)
  }
  
  return response
} 