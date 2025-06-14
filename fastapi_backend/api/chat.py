import os
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

from lib.supabase_client import supabase

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning("GEMINI_API_KEY not found in environment variables")

class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    created_at: Optional[datetime] = None

class ChatConversation(BaseModel):
    id: str
    summary_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessage] = []

class CreateConversationRequest(BaseModel):
    summary_id: str
    title: str

class SendMessageRequest(BaseModel):
    conversation_id: str
    message: str

class ChatResponse(BaseModel):
    conversation_id: str
    message: ChatMessage

async def create_conversation(request: CreateConversationRequest) -> ChatConversation:
    """Create a new chat conversation for a summary"""
    try:
        # Verify the summary exists
        summary_response = supabase.table("summaries").select("*").eq("id", request.summary_id).execute()
        if not summary_response.data:
            raise HTTPException(status_code=404, detail="Summary not found")
        
        # Create conversation
        conversation_data = {
            "summary_id": request.summary_id,
            "title": request.title
        }
        
        response = supabase.table("chat_conversations").insert(conversation_data).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
        
        conversation = response.data[0]
        return ChatConversation(
            id=conversation["id"],
            summary_id=conversation["summary_id"],
            title=conversation["title"],
            created_at=conversation["created_at"],
            updated_at=conversation["updated_at"],
            messages=[]
        )
        
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create conversation: {str(e)}")

async def get_conversations(summary_id: str) -> List[ChatConversation]:
    """Get all conversations for a summary"""
    try:
        response = supabase.table("chat_conversations").select("*").eq("summary_id", summary_id).order("created_at", desc=True).execute()
        
        conversations = []
        for conv_data in response.data:
            # Get messages for this conversation
            messages_response = supabase.table("chat_messages").select("*").eq("conversation_id", conv_data["id"]).order("created_at", desc=False).execute()
            
            messages = [
                ChatMessage(
                    role=msg["role"],
                    content=msg["content"],
                    created_at=msg["created_at"]
                )
                for msg in messages_response.data
            ]
            
            conversations.append(ChatConversation(
                id=conv_data["id"],
                summary_id=conv_data["summary_id"],
                title=conv_data["title"],
                created_at=conv_data["created_at"],
                updated_at=conv_data["updated_at"],
                messages=messages
            ))
        
        return conversations
        
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get conversations: {str(e)}")

async def get_conversation(conversation_id: str) -> ChatConversation:
    """Get a specific conversation with its messages"""
    try:
        # Get conversation
        conv_response = supabase.table("chat_conversations").select("*").eq("id", conversation_id).execute()
        if not conv_response.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conv_data = conv_response.data[0]
        
        # Get messages
        messages_response = supabase.table("chat_messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=False).execute()
        
        messages = [
            ChatMessage(
                role=msg["role"],
                content=msg["content"],
                created_at=msg["created_at"]
            )
            for msg in messages_response.data
        ]
        
        return ChatConversation(
            id=conv_data["id"],
            summary_id=conv_data["summary_id"],
            title=conv_data["title"],
            created_at=conv_data["created_at"],
            updated_at=conv_data["updated_at"],
            messages=messages
        )
        
    except Exception as e:
        logger.error(f"Error getting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get conversation: {str(e)}")

async def send_message(request: SendMessageRequest) -> ChatResponse:
    """Send a message and get AI response"""
    try:
        # Get conversation and verify it exists
        conversation = await get_conversation(request.conversation_id)
        
        # Get the original summary for context
        summary_response = supabase.table("summaries").select("*").eq("id", conversation.summary_id).execute()
        if not summary_response.data:
            raise HTTPException(status_code=404, detail="Summary not found")
        
        summary_data = summary_response.data[0]
        
        # Save user message
        user_message_data = {
            "conversation_id": request.conversation_id,
            "role": "user",
            "content": request.message
        }
        
        user_msg_response = supabase.table("chat_messages").insert(user_message_data).execute()
        if not user_msg_response.data:
            raise HTTPException(status_code=500, detail="Failed to save user message")
        
        # Prepare context for AI
        context = f"""
Video Title: {summary_data['title']}
Video Summary: {summary_data['summary']}
Video Transcript: {summary_data.get('transcript', 'No transcript available')}

Previous conversation:
"""
        
        # Add previous messages to context
        for msg in conversation.messages:
            context += f"{msg.role.capitalize()}: {msg.content}\n"
        
        # Add current user message
        context += f"User: {request.message}\n"
        
        # Generate AI response using Gemini
        if not GEMINI_API_KEY:
            raise HTTPException(status_code=500, detail="Gemini API key not configured")
        
        try:
            model = genai.GenerativeModel('gemini-2.0-flash-001')
            
            prompt = f"""You are an AI assistant helping users understand and discuss a video they've watched. 
You have access to the video's summary and transcript. Answer the user's question based on this information.
Be helpful, accurate, and conversational. If the question cannot be answered from the provided context, 
politely explain that and suggest what information might be needed.

{context}

Please provide a helpful response to the user's latest question."""
            
            response = model.generate_content(prompt)
            ai_response_text = response.text if hasattr(response, 'text') else str(response)
            
            # Save AI message
            ai_message_data = {
                "conversation_id": request.conversation_id,
                "role": "assistant",
                "content": ai_response_text
            }
            
            ai_msg_response = supabase.table("chat_messages").insert(ai_message_data).execute()
            if not ai_msg_response.data:
                raise HTTPException(status_code=500, detail="Failed to save AI message")
            
            return ChatResponse(
                conversation_id=request.conversation_id,
                message=ChatMessage(
                    role="assistant",
                    content=ai_response_text,
                    created_at=ai_msg_response.data[0]["created_at"]
                )
            )
        
        except Exception as e:
            logger.error(f"Error generating AI response: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to generate AI response: {str(e)}")
        
    except Exception as e:
        logger.error(f"Error sending message: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")

async def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation and all its messages"""
    try:
        # Delete conversation (messages will be deleted automatically due to CASCADE)
        response = supabase.table("chat_conversations").delete().eq("id", conversation_id).execute()
        return len(response.data) > 0
        
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete conversation: {str(e)}") 