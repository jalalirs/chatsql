import { api } from './auth';
import { Connection, Conversation } from '../types/chat';

export const chatService = {
  // Get user's connections (determined by token)
  async getConnections(): Promise<{connections: Connection[], total: number}> {
    const response = await api.get('/connections');
    return response.data;
  },

  // Get user's conversations (determined by token)  
  async getConversations(connectionId?: string): Promise<Conversation[]> {
    const params = connectionId ? { connection_id: connectionId } : {};
    const response = await api.get('/conversations', { params });
    return response.data;
  },

  // Get conversation with messages
  async getConversationWithMessages(conversationId: string) {
    const response = await api.get(`/conversations/${conversationId}`);
    return response.data;
  },

  // Create new conversation - UPDATED to match backend
  async createConversation(connectionId: string, title?: string): Promise<Conversation> {
    const response = await api.post('/conversations', {
      connection_id: connectionId,
      title
    });
    return response.data;
  },

  // Send query - UPDATED to handle backend conversation flow
  async sendQuery(question: string, conversationId?: string, connectionId?: string) {
    if (conversationId && conversationId !== 'new') {
      // Query to existing conversation
      const response = await api.post(`/conversations/${conversationId}/query`, {
        question
      });
      return response.data;
    } else {
      // This should not happen in the backend flow - conversations must be created first
      throw new Error('Backend requires conversation to be created first. Use createConversation()');
    }
  },

  // Get suggested questions for a conversation
  async getSuggestedQuestions(conversationId: string) {
    const response = await api.get(`/conversations/${conversationId}/questions`);
    return response.data;
  },

  // Get session status
  async getSessionStatus(sessionId: string) {
    const response = await api.get(`/conversations/sessions/${sessionId}/status`);
    return response.data;
  }
};