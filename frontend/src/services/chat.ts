import { api } from './auth';
import { Connection, Conversation } from '../types/chat';

export const chatService = {
  // Get user's connections (determined by token)
  async getConnections(): Promise<{connections: Connection[], total: number}> {
    try {
      console.log('📡 Loading connections...');
      const response = await api.get('/connections');
      console.log('✅ Connections loaded:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to load connections:', error);
      throw error;
    }
  },

  // Get user's conversations (determined by token)  
  async getConversations(connectionId?: string): Promise<Conversation[]> {
    try {
      console.log('📡 Loading conversations...');
      const params = connectionId ? { connection_id: connectionId } : {};
      const response = await api.get('/conversations', { params });
      console.log('✅ Conversations loaded:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to load conversations:', error);
      throw error;
    }
  },

  // Get conversation with messages
  async getConversationWithMessages(conversationId: string) {
    try {
      console.log(`📡 Loading conversation with messages: ${conversationId}`);
      const response = await api.get(`/conversations/${conversationId}`);
      console.log('✅ Conversation with messages loaded:', response.data);
      return response.data;
    } catch (error) {
      console.error(`❌ Failed to load conversation ${conversationId}:`, error);
      
      // Handle specific error cases
      if (error.response?.status === 404) {
        throw new Error('Conversation not found or access denied');
      } else if (error.response?.status === 500) {
        console.error('🔥 Server error details:', error.response?.data);
        throw new Error('Server error while loading conversation. Please check the backend logs.');
      }
      
      throw error;
    }
  },

  // Create new conversation - UPDATED to match backend
  async createConversation(connectionId: string, title?: string): Promise<Conversation> {
    try {
      console.log(`📡 Creating conversation: ${title} for connection: ${connectionId}`);
      const response = await api.post('/conversations', {
        connection_id: connectionId,
        title
      });
      console.log('✅ Conversation created:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to create conversation:', error);
      throw error;
    }
  },

  // DELETE CONVERSATION - FIXED to use api instance instead of fetch
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting conversation: ${conversationId}`);
      
      // Use the api instance which has auth interceptors instead of raw fetch
      const response = await api.delete(`/conversations/${conversationId}`);
      
      console.log('✅ Conversation deleted successfully:', response.data);
      
    } catch (error) {
      console.error('❌ Failed to delete conversation:', error);
      
      // Handle specific error cases
      if (error.response?.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (error.response?.status === 404) {
        throw new Error('Conversation not found or already deleted.');
      } else if (error.response?.status === 403) {
        throw new Error('You do not have permission to delete this conversation.');
      } else if (error.response?.status >= 500) {
        console.error('🔥 Server error details:', error.response?.data);
        throw new Error('Server error while deleting conversation. Please try again.');
      }
      
      throw new Error(error.response?.data?.detail || error.message || 'Failed to delete conversation');
    }
  },

  // Send query - UPDATED to handle backend conversation flow
  async sendQuery(question: string, conversationId?: string, connectionId?: string) {
    try {
      if (conversationId && conversationId !== 'new') {
        console.log(`📡 Sending query to conversation ${conversationId}:`, question);
        // Query to existing conversation
        const response = await api.post(`/conversations/${conversationId}/query`, {
          question
        });
        console.log('✅ Query sent:', response.data);
        return response.data;
      } else {
        // This should not happen in the backend flow - conversations must be created first
        throw new Error('Backend requires conversation to be created first. Use createConversation()');
      }
    } catch (error) {
      console.error('❌ Failed to send query:', error);
      throw error;
    }
  },

  // Get suggested questions for a conversation
  async getSuggestedQuestions(conversationId: string) {
    try {
      console.log(`📡 Loading suggested questions for conversation: ${conversationId}`);
      const response = await api.get(`/conversations/${conversationId}/questions`);
      console.log('✅ Suggested questions loaded:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to load suggested questions:', error);
      throw error;
    }
  },

  // Get session status
  async getSessionStatus(sessionId: string) {
    try {
      console.log(`📡 Loading session status: ${sessionId}`);
      const response = await api.get(`/conversations/sessions/${sessionId}/status`);
      console.log('✅ Session status loaded:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Failed to load session status:', error);
      throw error;
    }
  }
};