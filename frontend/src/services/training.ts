// src/services/training.ts
import { api } from './auth';
import {
  TrainingTaskResponse,
  TaskStatus,
  GenerateDataRequest,
  ModelTrainingDocumentation,
  ModelTrainingQuestion,
  ModelTrainingColumn,
  ModelTrainingData,
  DocumentationCreateRequest,
  DocumentationUpdateRequest,
  QuestionCreateRequest,
  QuestionUpdateRequest,
  ColumnCreateRequest,
  ColumnUpdateRequest,
  ModelQueryRequest,
  ModelQueryResponse
} from '../types/models';

export const trainingService = {
  // Generate training data for a model
  async generateTrainingData(modelId: string, numExamples: number): Promise<TrainingTaskResponse> {
    const response = await api.post(`/training/models/${modelId}/generate-data`, {
      num_examples: numExamples
    });
    return response.data;
  },

  // Train the model
  async trainModel(modelId: string): Promise<TrainingTaskResponse> {
    const response = await api.post(`/training/models/${modelId}/train`);
    return response.data;
  },

  // Query a trained model
  async queryModel(modelId: string, question: string, conversationId?: string): Promise<ModelQueryResponse> {
    const response = await api.post(`/training/models/${modelId}/query`, {
      question,
      conversation_id: conversationId
    });
    return response.data;
  },

  // Get task status
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await api.get(`/training/tasks/${taskId}/status`);
    return response.data;
  },

  // List user's training tasks
  async getUserTasks(taskType?: string): Promise<{tasks: TaskStatus[], total: number, user_id: string}> {
    const params = taskType ? { task_type: taskType } : {};
    const response = await api.get('/training/tasks', { params });
    return response.data;
  },

  // Get all training data for a model
  async getTrainingData(modelId: string): Promise<ModelTrainingData> {
    const response = await api.get(`/training/models/${modelId}/training-data`);
    return response.data;
  },

  // Documentation methods
  async getDocumentation(modelId: string): Promise<{documentation: ModelTrainingDocumentation[], total: number, model_id: string}> {
    const response = await api.get(`/training/models/${modelId}/documentation`);
    return response.data;
  },

  async createDocumentation(modelId: string, data: DocumentationCreateRequest): Promise<ModelTrainingDocumentation> {
    const response = await api.post(`/training/models/${modelId}/documentation`, data);
    return response.data;
  },

  async updateDocumentation(docId: string, data: DocumentationUpdateRequest): Promise<ModelTrainingDocumentation> {
    const response = await api.put(`/training/documentation/${docId}`, data);
    return response.data;
  },

  async deleteDocumentation(docId: string): Promise<{success: boolean, message: string}> {
    const response = await api.delete(`/training/documentation/${docId}`);
    return response.data;
  },

  // Question methods
  async getQuestions(modelId: string): Promise<{questions: ModelTrainingQuestion[], total: number, model_id: string}> {
    const response = await api.get(`/training/models/${modelId}/questions`);
    return response.data;
  },

  async createQuestion(modelId: string, data: QuestionCreateRequest): Promise<ModelTrainingQuestion> {
    const response = await api.post(`/training/models/${modelId}/questions`, data);
    return response.data;
  },

  async updateQuestion(questionId: string, data: QuestionUpdateRequest): Promise<ModelTrainingQuestion> {
    const response = await api.put(`/training/questions/${questionId}`, data);
    return response.data;
  },

  async deleteQuestion(questionId: string): Promise<{success: boolean, message: string}> {
    const response = await api.delete(`/training/questions/${questionId}`);
    return response.data;
  },

  // Column methods
  async getColumns(modelId: string): Promise<{columns: ModelTrainingColumn[], total: number, model_id: string}> {
    const response = await api.get(`/training/models/${modelId}/columns`);
    return response.data;
  },

  async createColumn(modelId: string, data: ColumnCreateRequest): Promise<ModelTrainingColumn> {
    const response = await api.post(`/training/models/${modelId}/columns`, data);
    return response.data;
  },

  async updateColumn(columnId: string, data: ColumnUpdateRequest): Promise<ModelTrainingColumn> {
    const response = await api.put(`/training/columns/${columnId}`, data);
    return response.data;
  },

  async deleteColumn(columnId: string): Promise<{success: boolean, message: string}> {
    const response = await api.delete(`/training/columns/${columnId}`);
    return response.data;
  }
};

// Export individual functions for backward compatibility
export const generateTrainingData = trainingService.generateTrainingData;
export const trainModel = trainingService.trainModel;
export const queryModel = trainingService.queryModel;
export const getTaskStatus = trainingService.getTaskStatus;
export const getUserTasks = trainingService.getUserTasks;
export const getTrainingData = trainingService.getTrainingData;
export const getDocumentation = trainingService.getDocumentation;
export const createDocumentation = trainingService.createDocumentation;
export const updateDocumentation = trainingService.updateDocumentation;
export const deleteDocumentation = trainingService.deleteDocumentation;
export const getQuestions = trainingService.getQuestions;
export const createQuestion = trainingService.createQuestion;
export const updateQuestion = trainingService.updateQuestion;
export const deleteQuestion = trainingService.deleteQuestion;
export const getColumns = trainingService.getColumns;
export const createColumn = trainingService.createColumn;
export const updateColumn = trainingService.updateColumn;
export const deleteColumn = trainingService.deleteColumn;