import { api } from './auth';
import { Connection } from '../types/chat';

export const connectionsService = {
  // Get user's connections
  async getConnections(): Promise<{connections: Connection[], total: number}> {
    try {
      const response = await api.get('/connections');
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to load connections:', error);
      throw error;
    }
  },

  // Get tables for a connection
  async getConnectionTables(connectionId: string): Promise<string[]> {
    try {
      const response = await api.get(`/connections/${connectionId}/tables`);
      // Extract table names from table objects
      const tables = response.data.tables || [];
      const tableNames = tables.map((table: any) => table.table_name || table.table_name_only || table);
      return tableNames;
    } catch (error: any) {
      console.error('❌ Failed to load connection tables:', error);
      throw error;
    }
  },

  // Get columns for a specific table
  async getTableColumns(connectionId: string, tableName: string): Promise<any[]> {
    try {
      const response = await api.get(`/connections/${connectionId}/tables/${tableName}/columns`);
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
