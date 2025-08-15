// Model Types
export interface Model {
  id: string;
  name: string;
  description?: string;
  connection_id: string;
  user_id: string;
  status: 'draft' | 'active' | 'archived' | 'training' | 'trained' | 'training_failed';
  created_at: string;
  updated_at?: string;
}

export interface ModelDetail extends Model {
  tracked_tables: ModelTrackedTable[];
  training_documentation: ModelTrainingDocumentation[];
  training_questions: ModelTrainingQuestion[];
  tracked_columns: ModelTrackedColumn[];
}

export interface ModelTrackedTable {
  id: string;
  model_id: string;
  table_name: string;
  schema_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface ModelTrackedColumn {
  id: string;
  model_tracked_table_id: string;
  column_name: string;
  is_tracked: boolean;
  description?: string;
  // Value information fields
  value_categories?: string[];
  value_range_min?: string;
  value_range_max?: string;
  value_distinct_count?: number;
  value_data_type?: string;
  value_sample_size?: number;
  created_at: string;
}

export interface ModelCreateRequest {
  name: string;
  description?: string;
  connection_id: string;
}

export interface ModelUpdateRequest {
  name?: string;
  description?: string;
  status?: string;
}

export interface ModelListResponse {
  models: Model[];
  total: number;
  page: number;
  per_page: number;
}

// Training Data Types (Model-based)
export interface ModelTrainingDocumentation {
  id: string;
  model_id: string;
  title: string;
  doc_type: string;
  content: string;
  category?: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelTrainingQuestion {
  id: string;
  model_id: string;
  question: string;
  sql: string;
  involved_columns?: Array<{ table: string; column: string }>;
  query_type?: string;
  difficulty?: string;
  generated_by: string;
  generation_model?: string;
  is_validated: boolean;
  validation_notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelTrainingColumn {
  id: string;
  model_id: string;
  table_name: string;
  column_name: string;
  column_type: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelTrainingData {
  documentation: ModelTrainingDocumentation[];
  questions: ModelTrainingQuestion[];
  columns: ModelTrainingColumn[];
  total: number;
  model_id: string;
}

// Training Request Types
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

export interface QuestionCreateRequest {
  question: string;
  sql: string;
  involved_columns?: Array<{ table: string; column: string }>;
  query_type?: string;
  difficulty?: string;
  generated_by?: string;
  generation_model?: string;
  is_validated?: boolean;
  validation_notes?: string;
}

export interface QuestionUpdateRequest {
  question?: string;
  sql?: string;
  involved_columns?: Array<{ table: string; column: string }>;
  query_type?: string;
  difficulty?: string;
  generated_by?: string;
  generation_model?: string;
  is_validated?: boolean;
  validation_notes?: string;
  is_active?: boolean;
}

export interface ColumnCreateRequest {
  table_name: string;
  column_name: string;
  data_type: string;
  description: string;
}

export interface ColumnUpdateRequest {
  table_name?: string;
  column_name?: string;
  data_type?: string;
  description?: string;
  is_active?: boolean;
}

// Training Task Types
export interface TrainingTaskResponse {
  task_id: string;
  model_id: string;
  task_type: string;
  status: string;
  progress: number;
  stream_url: string;
  created_at: string;
}

export interface TaskStatus {
  task_id: string;
  model_id: string;
  status: string;
  progress: number;
  message: string;
  error?: string;
}

// Enhanced Training Generation Types
export interface GenerationScope {
  type: 'single_table' | 'specific_columns' | 'multiple_tables' | 'multiple_tables_columns';
  tables: string[];
  columns: { [table: string]: string[] };
  numQuestions: number;
}

export interface QuestionGenerationRequest {
  type: 'single_table' | 'specific_columns' | 'multiple_tables' | 'multiple_tables_columns';
  tables: string[];
  columns: { [table: string]: string[] };
  num_questions: number;
  additional_instructions?: string;
}

export interface QuestionGenerationProgress {
  current: number;
  total: number;
  generatedQuestions: Array<{
    id: string;
    question: string;
    sql: string;
    involved_columns?: Array<{ table: string; column: string }>;
  }>;
}

export interface GenerationScopeConfig {
  type: GenerationScope['type'];
  tables: string[];
  columns: { [table: string]: string[] };
  numQuestions: number;
}

export interface QuestionGenerationResponse {
  success: boolean;
  generated_count: number;
  scope: string;
  message: string;
  error_message?: string;
}

export interface GenerateDataRequest {
  num_examples: number;
}

export interface ModelQueryRequest {
  question: string;
  conversation_id?: string;
}

export interface ModelQueryResponse {
  sql: string;
  results?: any[];
  row_count?: number;
  execution_time?: number;
  tokens_used?: number;
  model_used?: string;
}
