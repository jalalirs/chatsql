import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Play, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { Connection } from '../../types/chat';
import { api } from '../../services/auth';
import { sseConnection } from '../../services/sse';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:6020';

interface TrainingQuestion {
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

interface TrainingDataTabProps {
  connection: Connection;
  onConnectionUpdate: (connection: Connection) => void;
}

export const TrainingDataTab: React.FC<TrainingDataTabProps> = ({ connection, onConnectionUpdate }) => {
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numExamples, setNumExamples] = useState(20);
  const [liveExamples, setLiveExamples] = useState<any[]>([]);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  
  // CRUD states
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [creatingQuestion, setCreatingQuestion] = useState(false);
  const [deletingQuestion, setDeletingQuestion] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  
  // Form state
  const [formData, setFormData] = useState({
    question: '',
    sql: '',
    validation_notes: ''
  });

  useEffect(() => {
    loadQuestions();
  }, [connection.id]);

  const loadQuestions = async () => {
    try {
      setError(null);
      const response = await api.get(`/connections/${connection.id}/questions`);
      setQuestions(response.data.questions || []);
    } catch (err: any) {
      console.error('Failed to load questions:', err);
      if (err.response?.status === 404) {
        setQuestions([]);
      } else {
        setError(err.response?.data?.detail || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const generateExamples = async () => {
    setGenerating(true);
    setError(null);
    setLiveExamples([]);
    setGenerationProgress({ current: 0, total: numExamples });
    
    let completionReceived = false;
    
    try {
      const response = await api.post(`/connections/${connection.id}/generate-data`, {
        num_examples: numExamples
      });

      const result = response.data;

      if (result.stream_url) {
        const fullStreamUrl = result.stream_url.startsWith('http') 
          ? result.stream_url 
          : `${API_BASE_URL}${result.stream_url}`;
        
        const eventSource = new EventSource(fullStreamUrl);
        
        // Handle completion
        eventSource.addEventListener('data_generation_completed', (event: any) => {
          console.log('✅ Data generation completed:', event.data);
          completionReceived = true;
          setGenerating(false);
          loadQuestions(); // Reload questions from backend
          eventSource.close();
        });

        // Handle individual examples
        eventSource.addEventListener('example_generated', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            setLiveExamples(prev => [...prev, {
              id: `live-${data.example_number}`,
              question: data.question,
              sql: data.sql,
              example_number: data.example_number
            }]);
            setGenerationProgress(prev => ({ ...prev, current: data.example_number }));
          } catch (e) {
            console.error('Error parsing example:', e);
          }
        });

        // Handle errors
        eventSource.onerror = (error) => {
          console.error('❌ SSE connection error:', error);
          
          if (completionReceived) {
            return;
          }
          
          if (liveExamples.length === numExamples) {
            setGenerating(false);
            loadQuestions();
          } else {
            setError('Connection error - please try again');
            setGenerating(false);
          }
          
          eventSource.close();
        };
      }
      
    } catch (err: any) {
      console.error('Data generation failed:', err);
      setError(err.response?.data?.detail || err.message);
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    try {
      const createData = {
        question: formData.question,
        sql: formData.sql,
        generated_by: "manual",
        validation_notes: formData.validation_notes || undefined,
        is_validated: false
      };

      await api.post(`/connections/${connection.id}/questions`, createData);
      await loadQuestions();
      setCreatingQuestion(false);
      resetForm();
    } catch (err: any) {
      console.error('Failed to create question:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleUpdate = async (questionId: string) => {
    try {
      const updateData = {
        question: formData.question,
        sql: formData.sql,
        validation_notes: formData.validation_notes || undefined,
        is_validated: true // Mark as validated when manually edited
      };

      await api.put(`/connections/${connection.id}/questions/${questionId}`, updateData);
      await loadQuestions();
      setEditingQuestion(null);
      resetForm();
    } catch (err: any) {
      console.error('Failed to update question:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleDelete = async (questionId: string) => {
    try {
      await api.delete(`/connections/${connection.id}/questions/${questionId}`);
      await loadQuestions();
      setDeletingQuestion(null);
    } catch (err: any) {
      console.error('Failed to delete question:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const startEdit = (question: TrainingQuestion) => {
    setFormData({
      question: question.question,
      sql: question.sql,
      validation_notes: question.validation_notes || ''
    });
    setEditingQuestion(question.id);
  };

  const startCreate = () => {
    resetForm();
    setCreatingQuestion(true);
  };

  const resetForm = () => {
    setFormData({
      question: '',
      sql: '',
      validation_notes: ''
    });
  };

  const cancelEdit = () => {
    setEditingQuestion(null);
    setCreatingQuestion(false);
    resetForm();
  };

  const toggleExpanded = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  const getSourceBadgeColor = (generatedBy: string) => {
    switch (generatedBy) {
      case 'ai':
        return 'bg-blue-100 text-blue-800';
      case 'manual':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            <span className="text-gray-600">Loading training questions...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Training Questions & SQL</h2>
            <p className="text-gray-600">
              Question-SQL pairs that train the AI model for <strong>{connection.table_name}</strong>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={startCreate}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus size={16} />
              Add Question
            </button>
            
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Generate:</label>
              <select
                value={numExamples}
                onChange={(e) => setNumExamples(parseInt(e.target.value))}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
                disabled={generating}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
            
            <button
              onClick={generateExamples}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Play size={16} className={generating ? 'animate-spin' : ''} />
              {generating ? 'Generating...' : 'Generate with AI'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle size={16} />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Generation Progress */}
        {generating && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-800 mb-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="font-medium">Generating examples... ({generationProgress.current}/{generationProgress.total})</span>
            </div>
            
            <div className="w-full bg-blue-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
              ></div>
            </div>

            {liveExamples.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <h4 className="text-sm font-medium text-blue-800">Generated Examples:</h4>
                {liveExamples.map((example) => (
                  <div key={example.id} className="bg-white p-3 rounded border text-sm">
                    <div className="font-medium text-gray-900 mb-1">
                      Q{example.example_number}: {example.question}
                    </div>
                    <div className="text-gray-600 font-mono text-xs bg-gray-50 p-2 rounded">
                      {example.sql}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{questions.length}</div>
            <div className="text-sm text-blue-700">Total Questions</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">
              {questions.filter(q => q.generated_by === 'ai').length}
            </div>
            <div className="text-sm text-green-700">AI Generated</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-600">
              {questions.filter(q => q.generated_by === 'manual').length}
            </div>
            <div className="text-sm text-purple-700">Manual</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-600">
              {questions.filter(q => q.is_validated).length}
            </div>
            <div className="text-sm text-orange-700">Validated</div>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {creatingQuestion && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Question</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                placeholder="Enter a natural language question..."
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">SQL Query</label>
              <textarea
                value={formData.sql}
                onChange={(e) => setFormData(prev => ({ ...prev, sql: e.target.value }))}
                placeholder="SELECT * FROM ..."
                rows={4}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
              <textarea
                value={formData.validation_notes}
                onChange={(e) => setFormData(prev => ({ ...prev, validation_notes: e.target.value }))}
                placeholder="Add any notes about this question-SQL pair..."
                rows={2}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleCreate}
              disabled={!formData.question || !formData.sql}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              Create
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((question, index) => (
          <div key={question.id} className="bg-white rounded-lg border border-gray-200 p-6">
            {editingQuestion === question.id ? (
              // Edit Form
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Question</label>
                  <textarea
                    value={formData.question}
                    onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                    rows={3}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">SQL Query</label>
                  <textarea
                    value={formData.sql}
                    onChange={(e) => setFormData(prev => ({ ...prev, sql: e.target.value }))}
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Validation Notes</label>
                  <textarea
                    value={formData.validation_notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, validation_notes: e.target.value }))}
                    rows={2}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(question.id)}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    <Save size={14} />
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Display View
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                      Q{index + 1}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded font-medium ${getSourceBadgeColor(question.generated_by)}`}>
                      {question.generated_by === 'ai' ? 'AI Generated' : 'Manual'}
                    </span>
                    {question.is_validated && (
                      <span className="flex items-center gap-1 text-green-600 text-sm">
                        <CheckCircle size={14} />
                        Validated
                      </span>
                    )}
                    {question.generation_model && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        {question.generation_model}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleExpanded(question.id)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title={expandedQuestions.has(question.id) ? "Collapse SQL" : "Expand SQL"}
                    >
                      {expandedQuestions.has(question.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      onClick={() => startEdit(question)}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => setDeletingQuestion(question.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Question</h4>
                  <p className="text-gray-900">{question.question}</p>
                </div>
                
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">SQL Query</h4>
                  <div className="bg-gray-50 rounded p-3">
                    <pre className={`text-sm text-gray-800 whitespace-pre-wrap font-mono ${
                      expandedQuestions.has(question.id) ? '' : 'line-clamp-2'
                    }`}>
                      {question.sql}
                    </pre>
                  </div>
                </div>
                
                {question.validation_notes && (
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
                    <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded">{question.validation_notes}</p>
                  </div>
                )}
                
                <div className="text-xs text-gray-500">
                  Created: {new Date(question.created_at).toLocaleString()} | 
                  Updated: {new Date(question.updated_at).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {questions.length === 0 && !generating && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-center py-8">
            <Play size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Training Questions</h3>
            <p className="text-gray-600 mb-4">
              Add training questions manually or generate them with AI to train your model.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={startCreate}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus size={16} />
                Add Question
              </button>
              <button
                onClick={generateExamples}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Play size={16} />
                Generate with AI
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingQuestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Delete Question</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this training question? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deletingQuestion)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setDeletingQuestion(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};