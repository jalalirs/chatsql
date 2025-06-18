// src/services/training.ts
import { api } from './auth';

export interface TrainingTaskResponse {
  task_id: string;
  connection_id: string;
  task_type: string;
  status: string;
  progress: number;
  stream_url: string;
  created_at: string;
}

export interface TaskStatus {
  task_id: string;
  connection_id: string;
  user_id: string;
  task_type: string;
  status: string;
  progress: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface GenerateExamplesRequest {
  num_examples: number;
}

export interface TrainingDocumentation {
  id: string;
  connection_id: string;
  title: string;
  doc_type: string;
  content: string;
  category?: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentationCreateRequest {
  title: string;
  doc_type: string;
  content: string;
  category?: string;
  order_index?: number;
}

export interface DocumentationUpdateRequest {
  title?: string;
  doc_type?: string;
  content?: string;
  category?: string;
  order_index?: number;
  is_active?: boolean;
}

export interface TrainingQuestionSql {
  id: string;
  connection_id: string;
  question: string;
  sql: string;
  generated_by: string;
  generation_model?: string;
  is_validated: boolean;
  validation_notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuestionCreateRequest {
  question: string;
  sql: string;
  generated_by?: string;
  generation_model?: string;
  is_validated?: boolean;
  validation_notes?: string;
}

export interface QuestionUpdateRequest {
  question?: string;
  sql?: string;
  generated_by?: string;
  generation_model?: string;
  is_validated?: boolean;
  validation_notes?: string;
  is_active?: boolean;
}

export const trainingService = {
  // Generate training data for a connection
  async generateTrainingData(connectionId: string, numExamples: number): Promise<TrainingTaskResponse> {
    const response = await api.post(`/connections/${connectionId}/generate-data`, {
      num_examples: numExamples
    });
    return response.data;
  },

  // Train the model for a connection
  async trainModel(connectionId: string): Promise<TrainingTaskResponse> {
    const response = await api.post(`/connections/${connectionId}/train`);
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

  // Get training data for a connection
  async getTrainingData(connectionId: string) {
    const response = await api.get(`/connections/${connectionId}/training-data`);
    return response.data;
  },

  // Documentation methods
  async getDocumentation(connectionId: string): Promise<{documentation: TrainingDocumentation[], total: number, connection_id: string}> {
    const response = await api.get(`/connections/${connectionId}/documentation`);
    return response.data;
  },

  async createDocumentation(connectionId: string, data: DocumentationCreateRequest): Promise<TrainingDocumentation> {
    const response = await api.post(`/connections/${connectionId}/documentation`, data);
    return response.data;
  },

  async updateDocumentation(connectionId: string, docId: string, data: DocumentationUpdateRequest): Promise<TrainingDocumentation> {
    const response = await api.put(`/connections/${connectionId}/documentation/${docId}`, data);
    return response.data;
  },

  async deleteDocumentation(connectionId: string, docId: string): Promise<{success: boolean, message: string}> {
    const response = await api.delete(`/connections/${connectionId}/documentation/${docId}`);
    return response.data;
  },

  // Question methods
  async getQuestions(connectionId: string): Promise<{questions: TrainingQuestionSql[], total: number, connection_id: string}> {
    const response = await api.get(`/connections/${connectionId}/questions`);
    return response.data;
  },

  async createQuestion(connectionId: string, data: QuestionCreateRequest): Promise<TrainingQuestionSql> {
    const response = await api.post(`/connections/${connectionId}/questions`, data);
    return response.data;
  },

  async updateQuestion(connectionId: string, questionId: string, data: QuestionUpdateRequest): Promise<TrainingQuestionSql> {
    const response = await api.put(`/connections/${connectionId}/questions/${questionId}`, data);
    return response.data;
  },

  async deleteQuestion(connectionId: string, questionId: string): Promise<{success: boolean, message: string}> {
    const response = await api.delete(`/connections/${connectionId}/questions/${questionId}`);
    return response.data;
  }
};