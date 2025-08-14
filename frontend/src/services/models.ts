import { api } from './auth';
import {
  Model,
  ModelDetail,
  ModelCreateRequest,
  ModelUpdateRequest,
  ModelListResponse,
  ModelTrackedTable,
  ModelTrackedColumn
} from '../types/models';

export const modelService = {
  // Model CRUD operations
  async createModel(data: ModelCreateRequest): Promise<Model> {
    const response = await api.post('/models', data);
    return response.data;
  },

  async getModels(page: number = 1, perPage: number = 20, status?: string): Promise<ModelListResponse> {
    const params: any = { page, per_page: perPage };
    if (status) params.status = status;
    const response = await api.get('/models', { params });
    return response.data;
  },

  async getModel(modelId: string): Promise<ModelDetail> {
    const response = await api.get(`/models/${modelId}`);
    return response.data;
  },

  async updateModel(modelId: string, data: ModelUpdateRequest): Promise<Model> {
    const response = await api.put(`/models/${modelId}`, data);
    return response.data;
  },

  async deleteModel(modelId: string): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`/models/${modelId}`);
    return response.data;
  },

  // Model lifecycle management
  async archiveModel(modelId: string): Promise<Model> {
    const response = await api.post(`/models/${modelId}/archive`);
    return response.data;
  },

  async activateModel(modelId: string): Promise<Model> {
    const response = await api.post(`/models/${modelId}/activate`);
    return response.data;
  },

  async duplicateModel(modelId: string): Promise<Model> {
    const response = await api.post(`/models/${modelId}/duplicate`);
    return response.data;
  },

  // Tracked tables management
  async addTrackedTable(modelId: string, tableName: string): Promise<ModelTrackedTable> {
    const response = await api.post(`/models/${modelId}/tracked-tables`, {
      table_name: tableName,
      schema_name: null,
      is_active: true
    });
    return response.data;
  },

  async getTrackedTables(modelId: string): Promise<ModelTrackedTable[]> {
    const response = await api.get(`/models/${modelId}/tracked-tables`);
    return response.data;
  },

  async removeTrackedTable(modelId: string, tableId: string): Promise<{ success: boolean; message: string }> {
    const response = await api.delete(`/models/${modelId}/tracked-tables/${tableId}`);
    return response.data;
  },

  async updateTrackedColumns(modelId: string, tableId: string, columns: ModelTrackedColumn[]): Promise<ModelTrackedColumn[]> {
    const response = await api.put(`/models/${modelId}/tracked-tables/${tableId}/columns`, columns.map(col => ({
      column_name: col.column_name,
      is_tracked: col.is_tracked,
      description: col.description
    })));
    return response.data;
  },

  async getModelTrackedColumns(modelId: string, tableId: string): Promise<ModelTrackedColumn[]> {
    const response = await api.get(`/models/${modelId}/tracked-tables/${tableId}/columns`);
    return response.data;
  }
};

// Export individual functions for backward compatibility
export const createModel = modelService.createModel;
export const getModels = modelService.getModels;
export const getModel = modelService.getModel;
export const updateModel = modelService.updateModel;
export const deleteModel = modelService.deleteModel;
export const archiveModel = modelService.archiveModel;
export const activateModel = modelService.activateModel;
export const duplicateModel = modelService.duplicateModel;
export const addTrackedTable = modelService.addTrackedTable;
export const getModelTrackedTables = modelService.getTrackedTables;
export const removeTrackedTable = modelService.removeTrackedTable;
export const updateTrackedColumns = modelService.updateTrackedColumns;
export const getModelTrackedColumns = modelService.getModelTrackedColumns;
