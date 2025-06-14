# 🎥 AI-Powered Video Analysis Platform

A comprehensive full-stack application that leverages AI to analyze, transcribe, and summarize video content with an interactive chat interface for follow-up questions.

## 🌟 Features

### 🎯 Core Functionality
- **📹 Multi-Format Video Upload**: Support for MP4, AVI, MOV, MKV, WebM, WMV, FLV
- **🤖 AI-Powered Analysis**: Advanced video analysis using Google's Gemini 2.0 Flash model
- **📝 Automatic Transcription**: Extract and transcribe audio content from videos
- **📊 Intelligent Summarization**: Generate comprehensive summaries with key insights
- **💬 Interactive Chat**: Ask follow-up questions about your video content

### 🚀 Advanced Features
- **☁️ Cloud Storage**: Secure AWS S3 integration for video storage
- **📱 Real-time Progress**: Live streaming updates during processing
- **📚 History Management**: Complete conversation and summary history
- **🗑️ Smart Deletion**: Cascade delete summaries with all associated data
- **🎨 Modern UI**: Clean, responsive interface
- **⚡ Performance Optimized**: Efficient file handling and processing

### 🛡️ Technical Excellence
- **🔒 Secure File Handling**: Presigned URLs and validation
- **📈 Scalable Architecture**: Microservices-based design
- **🐳 Docker Ready**: Complete containerization support
- **🔄 Error Recovery**: Comprehensive error handling and retry mechanisms
- **📊 Progress Tracking**: Detailed processing status updates

## 🏗️ Tech Stack

### Frontend
- **⚛️ Next.js 15** - React framework with App Router
- **🎨 React 19** - Latest React with concurrent features
- **💎 TypeScript** - Type-safe development
- **🎭 Tailwind CSS** - Utility-first CSS framework
- **🧩 Radix UI** - Accessible component primitives

### Backend
- **🐍 FastAPI** - Modern Python web framework
- **⚡ Uvicorn** - Lightning-fast ASGI server
- **🔄 Async/Await** - Non-blocking operations
- **📡 Streaming Responses** - Real-time progress updates
- **🛡️ Pydantic** - Data validation and serialization

### AI & Processing
- **🧠 Google Gemini 2.0 Flash** - Advanced AI model for analysis 
- **🎵 Google Files API** - Video processing pipeline
- **🔊 Audio Processing** - Speech-to-text capabilities

### Database & Storage
- **🗄️ Supabase (PostgreSQL)** - Managed database with real-time features
- **☁️ AWS S3** - Scalable object storage
- **🔐 Row Level Security** - Database-level security
- **📊 Optimized Queries** - Indexed and performant

### DevOps & Deployment
- **🐳 Docker** - Containerization
- **🔧 Docker Compose** - Multi-service orchestration
- **🌐 CORS Configuration** - Cross-origin resource sharing
- **📝 Environment Management** - Secure configuration

## 📋 Prerequisites

### Required API Keys & Services

1. **Google Gemini API Key**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Enable Gemini API access

2. **Supabase Account**
   - Sign up at [Supabase](https://supabase.com)
   - Create a new project
   - Get your project URL and anon key

3. **AWS Account**
   - Create an [AWS account](https://aws.amazon.com)
   - Set up S3 bucket for video storage
   - Create IAM user with S3 permissions

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ai-video-analysis.git
cd ai-video-analysis
```

### 2. Environment Setup

#### Backend Environment
```bash
# Navigate to backend directory
cd fastapi_backend

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### 3. Database Setup

```bash
# Run the SQL schema in your Supabase dashboard
# Copy contents of supabase-schema.sql and execute in Supabase SQL editor
```

### 4. Install Dependencies

#### Frontend Dependencies
```bash
# Install Node.js dependencies
npm install
```

#### Backend Dependencies
```bash
# Navigate to backend directory
cd fastapi_backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

### 5. Start Development Servers

#### Terminal 1 - Frontend
```bash
npm run dev
```

#### Terminal 2 - Backend
```bash
cd fastapi_backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 6. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

## 📖 Detailed Setup Guide

### Environment Variables Configuration (refer to example.env)

#### Frontend (.env.local)
```env
# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-video-upload-bucket

# Backend API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

#### Backend (fastapi_backend/.env)
```env
# Server Configuration
PORT=8000
HOST=0.0.0.0

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-video-upload-bucket
```

### AWS S3 Setup

1. **Create S3 Bucket**
```bash
# Using AWS CLI
aws s3 mb s3://your-video-upload-bucket --region us-east-1
```

2. **Set Bucket Policy**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-ACCOUNT-ID:user/YOUR-IAM-USER"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-video-upload-bucket/*"
    }
  ]
}
```

3. **Configure CORS**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Supabase Database Schema

The application uses the following database structure (refer supabase-schema.sql)


## 🎯 How to Use the Application

### 1. Video Upload & Analysis

#### Method 1: Direct File Upload
1. **Select Video File**: Click "Choose File" or drag & drop
2. **File Validation**: System validates format, size (max 500MB), and duration (max 30 min)
3. **Upload Progress**: Real-time upload progress with file details
4. **Processing**: AI analysis with live status updates
5. **Results**: View generated Analysis and transcript


### 2. Interactive Chat

1. **Access Chat**: Click on any processed video summary
2. **Ask Questions**: Type questions about the video content, Timestamp or language translation
3. **AI Responses**: Get contextual answers based on video analysis
4. **Conversation History**: All chats are saved and accessible

### 3. History Management

1. **View History**: Access all processed videos from history page
2. **Delete Summaries**: Remove summaries and all associated data

