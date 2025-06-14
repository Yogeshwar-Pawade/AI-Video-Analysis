from fastapi import APIRouter, HTTPException
from typing import List
from .chat import (
    ChatConversation, 
    ChatResponse, 
    CreateConversationRequest, 
    SendMessageRequest,
    create_conversation,
    get_conversations,
    get_conversation,
    send_message,
    delete_conversation
)

router = APIRouter()

@router.post("/chat/conversations", response_model=ChatConversation)
async def create_chat_conversation(request: CreateConversationRequest):
    """Create a new chat conversation for a summary"""
    return await create_conversation(request)

@router.get("/chat/conversations/{summary_id}", response_model=List[ChatConversation])
async def get_chat_conversations(summary_id: str):
    """Get all conversations for a summary"""
    return await get_conversations(summary_id)

@router.get("/chat/conversation/{conversation_id}", response_model=ChatConversation)
async def get_chat_conversation(conversation_id: str):
    """Get a specific conversation with its messages"""
    return await get_conversation(conversation_id)

@router.post("/chat/message", response_model=ChatResponse)
async def send_chat_message(request: SendMessageRequest):
    """Send a message and get AI response"""
    return await send_message(request)

@router.delete("/chat/conversation/{conversation_id}")
async def delete_chat_conversation(conversation_id: str):
    """Delete a conversation and all its messages"""
    success = await delete_conversation(conversation_id)
    if success:
        return {"message": "Conversation deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Conversation not found") 