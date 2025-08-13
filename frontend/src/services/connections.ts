import { api } from './auth';
import { Connection } from '../types/chat';

export const connectionsService = {
  // Get user's connections
  async getConnections(): Promise<{connections: Connection[], total: number}> {
    try {
      console.log('📡 Loading connections...');
      const response = await api.get('/connections');
      console.log('✅ Connections loaded:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to load connections:', error);
      throw error;
    }
  },

  // Get tables for a connection
  async getConnectionTables(connectionId: string): Promise<string[]> {
    try {
      console.log(`📡 Loading tables for connection: ${connectionId}`);
      const response = await api.get(`/connections/${connectionId}/tables`);
      console.log('✅ Tables loaded:', response.data);
      return response.data.tables || [];
    } catch (error: any) {
      console.error('❌ Failed to load connection tables:', error);
      throw error;
    }
  },

  // Get columns for a specific table
  async getTableColumns(connectionId: string, tableName: string): Promise<any[]> {
    try {
      console.log(`📡 Loading columns for table: ${tableName} in connection: ${connectionId}`);
      const response = await api.get(`/connections/${connectionId}/tables/${tableName}/columns`);
      console.log('✅ Columns loaded:', response.data);
      return response.data.columns || [];
    } catch (error: any) {
      console.error('❌ Failed to load table columns:', error);
      throw error;
    }
  }
};

// Export individual functions for backward compatibility
export const getConnections = connectionsService.getConnections;
export const getConnectionTables = connectionsService.getConnectionTables;
export const getTableColumns = connectionsService.getTableColumns;
