"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Send, Plus, Trash2, Bot, File, Folder, Circle, ArrowLeft } from "lucide-react"
import { getApiUrl, API_CONFIG, apiRequest } from "@/lib/config"
import ReactMarkdown from 'react-markdown'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

interface ChatConversation {
  id: string
  summary_id: string
  title: string
  created_at: string
  updated_at: string
  messages: ChatMessage[]
}

interface ChatInterfaceProps {
  summaryId: string
  summaryTitle: string
  onBack?: () => void
}

export function ChatInterface({ summaryId, summaryTitle, onBack }: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null)
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeConversation?.messages])

  useEffect(() => {
    loadConversations()
  }, [summaryId])

  const loadConversations = async () => {
    try {
      setIsLoading(true)
      const response = await apiRequest(`${API_CONFIG.ENDPOINTS.CHAT_CONVERSATIONS}/${summaryId}`)
      const data = await response.json()
      setConversations(data)
      
      // Auto-select the first conversation if available
      if (data.length > 0 && !activeConversation) {
        setActiveConversation(data[0])
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const createNewConversation = async () => {
    try {
      const response = await apiRequest(API_CONFIG.ENDPOINTS.CHAT_CONVERSATIONS, {
        method: 'POST',
        body: JSON.stringify({
          summary_id: summaryId,
          title: `Chat about ${summaryTitle}`
        })
      })
      
      const newConversation = await response.json()
      setConversations(prev => [newConversation, ...prev])
      setActiveConversation(newConversation)
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  const sendMessage = async () => {
    if (!message.trim() || !activeConversation || isSending) return

    const userMessage = message.trim()
    setMessage("")
    setIsSending(true)

    try {
      // Add user message to UI immediately
      const tempUserMessage: ChatMessage = {
        role: 'user',
        content: userMessage,
        created_at: new Date().toISOString()
      }

      setActiveConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, tempUserMessage]
      } : null)

      // Send message to API
      const response = await apiRequest(API_CONFIG.ENDPOINTS.CHAT_MESSAGE, {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: activeConversation.id,
          message: userMessage
        })
      })

      const chatResponse = await response.json()
      
      // Add AI response to UI
      setActiveConversation(prev => prev ? {
        ...prev,
        messages: [...prev.messages, chatResponse.message]
      } : null)

      // Update conversations list
      setConversations(prev => prev.map(conv => 
        conv.id === activeConversation.id 
          ? { ...conv, messages: [...conv.messages, tempUserMessage, chatResponse.message] }
          : conv
      ))

    } catch (error) {
      console.error('Failed to send message:', error)
      // Remove the temporary user message on error
      setActiveConversation(prev => prev ? {
        ...prev,
        messages: prev.messages.slice(0, -1)
      } : null)
    } finally {
      setIsSending(false)
    }
  }

  const deleteConversation = async (conversationId: string) => {
    try {
      await apiRequest(`${API_CONFIG.ENDPOINTS.CHAT_CONVERSATION}/${conversationId}`, {
        method: 'DELETE'
      })
      
      setConversations(prev => prev.filter(conv => conv.id !== conversationId))
      
      if (activeConversation?.id === conversationId) {
        const remaining = conversations.filter(conv => conv.id !== conversationId)
        setActiveConversation(remaining.length > 0 ? remaining[0] : null)
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    })
  }

  return (
    <div className="flex h-screen bg-white text-gray-900 overflow-hidden border-r border-gray-200 font-mono">
      {/* VS Code Style Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
        {/* Sidebar Header */}
        <div className="p-3 border-b border-gray-200 bg-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-gray-700 text-sm font-semibold">
              <Folder className="h-4 w-4" />
              CONVERSATIONS
            </div>
            <Button
              onClick={createNewConversation}
              size="sm"
              className="h-6 w-6 p-0 bg-blue-600 hover:bg-blue-700 border-0 text-white"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-700 text-sm">No conversations</p>
              <p className="text-gray-500 text-xs mt-1">Create a new chat</p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${
                    activeConversation?.id === conversation.id
                      ? 'bg-blue-100 text-blue-900 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => setActiveConversation(conversation)}
                >
                  <File className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {conversation.title.replace('Chat about ', '')}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>{conversation.messages.length} messages</span>
                      <Circle className="h-1 w-1 fill-current" />
                      <span>{new Date(conversation.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conversation.id)
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-gray-400 hover:text-red-600 hover:bg-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {/* VS Code Style Tab Bar - Always show */}
        <div className="bg-gray-100 border-b border-gray-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeConversation ? (
                <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-t text-sm border-t border-l border-r border-gray-200">
                  <Bot className="h-4 w-4 text-blue-600" />
                  <span className="text-gray-700">
                    {activeConversation.title.replace('Chat about ', '')}
                  </span>
                  <Circle className="h-2 w-2 fill-blue-600" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Bot className="h-4 w-4" />
                  <span>No conversation selected</span>
                </div>
              )}
            </div>
            {onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>
        </div>

        {activeConversation ? (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
              {activeConversation.messages.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="h-8 w-8 text-blue-600" />
                  </div>
                  <h4 className="font-semibold text-gray-700 mb-2">// Start coding your conversation</h4>
                  <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Type your questions below to start an interactive session with the AI assistant.
                  </p>
                </div>
              ) : (
                activeConversation.messages.map((msg, index) => (
                  <div key={index} className="space-y-2">
                    {/* Message Header */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-200 text-blue-600'
                      }`}>
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                      <span className="text-gray-500">
                        {msg.created_at && formatTime(msg.created_at)}
                      </span>
                    </div>
                    
                    {/* Message Content */}
                    <div className={`p-4 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-gray-50 border-l-4 border-blue-600'
                        : 'bg-blue-50 border-l-4 border-blue-600'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-blue prose-sm max-w-none text-gray-700">
                          <ReactMarkdown 
                            components={{
                              code: ({inline, ...props}: any) => (
                                <code 
                                  className={inline 
                                    ? "bg-gray-200 px-1 py-0.5 rounded text-blue-700" 
                                    : "block bg-gray-200 p-2 rounded text-blue-700 overflow-x-auto"
                                  } 
                                  {...props} 
                                />
                              ),
                              pre: ({children}: any) => (
                                <pre className="bg-gray-200 p-3 rounded border border-gray-300 overflow-x-auto">
                                  {children}
                                </pre>
                              )
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              
              {isSending && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-blue-600">
                      AI Assistant
                    </span>
                    <span className="text-gray-500">typing...</span>
                  </div>
                  <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-gray-600 text-sm">Processing your request...</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* VS Code Style Input Area */}
            <div className="bg-gray-100 border-t border-gray-200 p-4">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-3 text-gray-500 text-sm">
                    &gt;
                  </div>
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your question here..."
                    className="bg-white border-gray-300 text-gray-700 pl-8 pr-4 py-3 focus:border-blue-500 focus:ring-blue-500 placeholder:text-gray-500 font-mono"
                    disabled={isSending}
                  />
                </div>
                <Button
                  onClick={sendMessage}
                  disabled={!message.trim() || isSending}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 h-auto"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Press Enter to send • Shift+Enter for new line
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="h-10 w-10 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">// No conversation selected</h3>
              <p className="text-gray-500 mb-6 max-w-md">
                Select a conversation from the sidebar or create a new one to start chatting.
              </p>
              <Button
                onClick={createNewConversation}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Conversation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 