export interface Connection {
  id: string;
  name: string;
  server: string;
  database_name: string;
  username: string;
  driver?: string;
  encrypt: boolean;
  trust_server_certificate: boolean;
  status: 'testing' | 'test_success' | 'test_failed';
  test_successful: boolean;
  created_at: string;
  updated_at: string;
}
  
  export interface Conversation {
    id: string;
    connection_id: string;
    connection_name: string;
    title: string;
    description?: string;
    is_active: boolean;
    is_pinned: boolean;
    connection_locked: boolean;
    message_count: number;
    total_queries: number;
    created_at: string;
    updated_at: string;
    last_message_at: string;
    latest_message?: string;
  }
  
  export interface Message {
    id: string;
    content: string;
    message_type: 'user' | 'assistant' | 'system';
    generated_sql?: string;
    query_results?: {
      data: any[];
      row_count: number;
    };
    chart_data?: {
      type: string;
      title: string;
      data: number[];
      labels: string[];
    };
    summary?: string;
    execution_time?: number;
    row_count?: number;
    tokens_used?: number;
    model_used?: string;
    is_edited: boolean;
    created_at: string;
    updated_at: string;
  }