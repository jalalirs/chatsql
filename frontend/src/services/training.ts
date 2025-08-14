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
  ModelQueryResponse,
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  QuestionGenerationProgress
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
    // The backend returns the questions array directly, so we need to wrap it
    return {
      questions: response.data,
      total: response.data.length,
      model_id: modelId
    };
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
  },

  // AI Generation methods
  async generateColumnDescriptions(modelId: string, scope: 'column' | 'table' | 'all', tableName?: string, columnName?: string, additionalInstructions?: string): Promise<{success: boolean, generated_count: number, error_message?: string, generated_descriptions?: any}> {
    const params = new URLSearchParams();
    params.append('scope', scope);
    if (tableName) params.append('table_name', tableName);
    if (columnName) params.append('column_name', columnName);
    if (additionalInstructions) params.append('additional_instructions', additionalInstructions);
    
    const response = await api.post(`/training/models/${modelId}/generate-column-descriptions?${params.toString()}`);
    return response.data;
  },

  async generateTableDescriptions(modelId: string, tableName?: string, additionalInstructions?: string): Promise<{success: boolean, generated_count: number, error_message?: string, generated_descriptions?: any}> {
    const params = new URLSearchParams();
    if (tableName) params.append('table_name', tableName);
    if (additionalInstructions) params.append('additional_instructions', additionalInstructions);
    
    const response = await api.post(`/training/models/${modelId}/generate-table-descriptions?${params.toString()}`);
    console.log('🔍 Frontend service - Raw response:', response);
    console.log('🔍 Frontend service - Response data:', response.data);
    console.log('🔍 Frontend service - generated_descriptions in response:', response.data.generated_descriptions);
    return response.data;
  },

  async generateAllDescriptions(modelId: string, additionalInstructions?: string): Promise<{success: boolean, generated_count: number, error_message?: string, generated_descriptions?: any}> {
    const params = new URLSearchParams();
    if (additionalInstructions) params.append('additional_instructions', additionalInstructions);
    
    const response = await api.post(`/training/models/${modelId}/generate-all-descriptions?${params.toString()}`);
    return response.data;
  },

  async generateAllDescriptionsSSE(modelId: string, additionalInstructions?: string): Promise<string> {
    const params = new URLSearchParams();
    if (additionalInstructions) params.append('additional_instructions', additionalInstructions);
    
    // Return the SSE stream URL (GET request)
    return `${api.defaults.baseURL}/training/models/${modelId}/generate-all-descriptions-sse?${params.toString()}`;
  },

  // Validate training question
  async validateQuestion(questionId: string): Promise<{
    success: boolean;
    is_validated: boolean;
    validation_notes: string;
    execution_result?: any[];
    message: string;
  }> {
    try {
      const response = await api.post(`/training/questions/${questionId}/validate`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to validate training question:', error);
      throw error;
    }
  },

  // Enhanced Question Generation with SSE
  async generateEnhancedQuestions(
    modelId: string, 
    scopeConfig: QuestionGenerationRequest,
    onProgress?: (progress: QuestionGenerationProgress) => void
  ): Promise<QuestionGenerationResponse> {
    try {
      const response = await api.post(`/training/models/${modelId}/generate-questions`, scopeConfig);
      
      // If there's a stream URL, set up SSE for real-time progress
      if (response.data.stream_url) {
        const eventSource = new EventSource(response.data.stream_url);
        
        eventSource.addEventListener('question_generated', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (onProgress) {
              onProgress({
                current: data.example_number,
                total: scopeConfig.num_questions,
                generatedQuestions: [{
                  id: `live-${data.example_number}`,
                  question: data.question,
                  sql: data.sql,
                  involved_columns: data.involved_columns
                }]
              });
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        });

        eventSource.addEventListener('generation_completed', (event) => {
          console.log('✅ Question generation completed:', event.data);
          eventSource.close();
        });

        eventSource.addEventListener('error', (event) => {
          console.error('❌ SSE connection error:', event);
          eventSource.close();
        });
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Failed to generate enhanced questions:', error);
      throw error;
    }
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
export const generateColumnDescriptions = trainingService.generateColumnDescriptions;
export const generateTableDescriptions = trainingService.generateTableDescriptions;
export const generateAllDescriptions = trainingService.generateAllDescriptions;
export const generateAllDescriptionsSSE = trainingService.generateAllDescriptionsSSE;
export const generateEnhancedQuestions = trainingService.generateEnhancedQuestions;
export const validateQuestion = trainingService.validateQuestion;