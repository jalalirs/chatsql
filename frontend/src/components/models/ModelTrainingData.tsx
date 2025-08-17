import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Play, AlertCircle, CheckCircle, Eye, EyeOff, Database, Edit, CheckSquare } from 'lucide-react';
import { ModelDetail, ModelTrackedColumn } from '../../types/models';
import { 
  getTrainingData, 
  createDocumentation,
  createQuestion,
  createColumn,
  updateDocumentation,
  deleteDocumentation,
  getQuestions,
  updateQuestion,
  deleteQuestion,
  generateEnhancedQuestions,
  validateQuestion,
  generateColumnDescriptions,
  generateTableDescriptions,
  generateAllDescriptions,
  getDocumentation,
  generateSqlFromQuestions
} from '../../services/training';
import { getTemplates, DocumentationTemplate } from '../../services/templates';
import { getModelTrackedColumns, getModelTrackedTables } from '../../services/models';

interface ModelTrainingProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
  showOnlyColumnTraining?: boolean;
}

const ModelTraining: React.FC<ModelTrainingProps> = ({ model, onModelUpdate, showOnlyColumnTraining = false }) => {
  const [trainingData, setTrainingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'documentation' | 'questions' | 'columns'>('documentation');
  const [showAddDocumentation, setShowAddDocumentation] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  
  // Additional features state
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [additionalInstructionsColumns, setAdditionalInstructionsColumns] = useState('');
  const [validatingQuestion, setValidatingQuestion] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<{[key: string]: any[]}>({});
  const [showValidationResults, setShowValidationResults] = useState<Set<string>>(new Set());
  const [trackedTables, setTrackedTables] = useState<any[]>([]);
  const [trackedColumns, setTrackedColumns] = useState<ModelTrackedColumn[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [documentation, setDocumentation] = useState<any[]>([]);

  useEffect(() => {
    loadTrainingData();
  }, [model.id]);

  const loadTrainingData = async () => {
    try {
      setLoading(true);
      const data = await getTrainingData(model.id);
      setTrainingData(data);
      
      // Load additional data for new features
      const tablesData = await getModelTrackedTables(model.id);
      setTrackedTables(tablesData);
      
      // Load columns for each table
      const allColumns: ModelTrackedColumn[] = [];
      for (const table of tablesData) {
        const columnsData = await getModelTrackedColumns(model.id, table.id);
        allColumns.push(...columnsData);
      }
      setTrackedColumns(allColumns);
      
      const questionsData = await getQuestions(model.id);
      setQuestions(questionsData.questions || []);
      
      const docsData = await getDocumentation(model.id);
      setDocumentation(docsData.documentation || []);
      
    } catch (error) {
      console.error('Failed to load training data:', error);
    } finally {
      setLoading(false);
    }
  };



  const handleValidate = async (questionId: string) => {
    try {
      setValidatingQuestion(questionId);
      
      const result = await validateQuestion(questionId);
      
      // Update validation results
      setValidationResults(prev => ({
        ...prev,
        [questionId]: result.execution_result || []
      }));

      // Update questions list
      const updatedQuestions = questions.map(q => 
        q.id === questionId 
          ? { ...q, is_validated: result.is_validated, validation_notes: result.validation_notes }
          : q
      );
      setQuestions(updatedQuestions);

      // Show results if successful
      if (result.is_validated && result.execution_result) {
        setShowValidationResults(prev => new Set(prev).add(questionId));
      }

    } catch (error) {
      console.error('Failed to validate question:', error);
    } finally {
      setValidatingQuestion(null);
    }
  };

  const toggleValidationResults = (questionId: string) => {
    setShowValidationResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Training Data Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Training Data</h3>
        </div>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'documentation', name: 'Documentation' },
              { id: 'questions', name: 'Questions' },
              { id: 'columns', name: 'Tables Schema' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
        <div className="px-6 py-4">
          {activeTab === 'documentation' && (
            <TrainingDocumentation 
              trainingData={trainingData} 
              modelId={model.id} 
              onUpdate={loadTrainingData}
              showAdd={showAddDocumentation}
              onToggleAdd={() => setShowAddDocumentation(!showAddDocumentation)}
            />
          )}
          {activeTab === 'questions' && (
            <TrainingQuestions 
              trainingData={trainingData} 
              modelId={model.id} 
              onUpdate={loadTrainingData}
              showAdd={showAddQuestion}
              onToggleAdd={() => setShowAddQuestion(!showAddQuestion)}
              model={model}
            />
          )}
          {activeTab === 'columns' && (
             <TablesSchema 
               trainingData={trainingData} 
               modelId={model.id} 
               onUpdate={loadTrainingData}
               showAdd={showAddColumn}
               onToggleAdd={() => setShowAddColumn(!showAddColumn)}
             />
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-components for different training data types
const TrainingDocumentation: React.FC<{ 
  trainingData: any; 
  modelId: string; 
  onUpdate: () => void;
  showAdd: boolean;
  onToggleAdd: () => void;
}> = ({ trainingData, modelId, onUpdate, showAdd, onToggleAdd }) => {
  const [newDocumentation, setNewDocumentation] = useState({
    content: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [templates, setTemplates] = useState<DocumentationTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await createDocumentation(modelId, {
        title: 'General Documentation',
        doc_type: 'general',
        content: newDocumentation.content
      });
      setNewDocumentation({ content: '' });
      onToggleAdd();
      onUpdate();
    } catch (error) {
      console.error('Failed to add documentation:', error);
      // TODO: Add proper error handling/notification
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (doc: any) => {
    setEditingDoc(doc.id);
    setEditContent(doc.content);
  };

  const handleSaveEdit = async (docId: string) => {
    try {
      setSubmitting(true);
      await updateDocumentation(docId, {
        content: editContent
      });
      setEditingDoc(null);
      setEditContent('');
      onUpdate();
    } catch (error) {
      console.error('Failed to update documentation:', error);
      // TODO: Add proper error handling/notification
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingDoc(null);
    setEditContent('');
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this documentation?')) {
      return;
    }
    
    try {
      setSubmitting(true);
      await deleteDocumentation(docId);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete documentation:', error);
      // TODO: Add proper error handling/notification
    } finally {
      setSubmitting(false);
    }
  };

  // Load templates on component mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const templatesData = await getTemplates();
        setTemplates(templatesData);
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    };
    loadTemplates();
  }, []);

  const handleUseTemplate = (template: DocumentationTemplate) => {
    setNewDocumentation({ content: template.content });
    setShowTemplates(false);
  };

  return (
  <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-900">Documentation</h4>
        <button 
          onClick={onToggleAdd}
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          {showAdd ? 'Cancel' : 'Add New'}
        </button>
    </div>
    
      {showAdd && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50">
          <div className="space-y-3">
      <div>
              <label className="block text-sm font-medium text-gray-700">Content</label>
              <div className="mt-1 flex space-x-2">
                <textarea
                  value={newDocumentation.content}
                  onChange={(e) => setNewDocumentation({...newDocumentation, content: e.target.value})}
                  className="flex-1 border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  rows={3}
                  placeholder="Enter general documentation about the model or database..."
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="px-3 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-300 rounded-md hover:bg-indigo-50"
                >
                  Templates
                </button>
            </div>
              
              {showTemplates && templates.length > 0 && (
                <div className="mt-2 p-3 border border-gray-200 rounded-md bg-white">
                  <h5 className="text-sm font-medium text-gray-900 mb-2">Available Templates:</h5>
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div key={template.id} className="flex justify-between items-center p-2 border border-gray-100 rounded hover:bg-gray-50">
                        <div className="flex-1">
                          <h6 className="text-sm font-medium text-gray-900">{template.name}</h6>
                          <p className="text-xs text-gray-500">{template.description}</p>
        </div>
                        <button
                          type="button"
                          onClick={() => handleUseTemplate(template)}
                          className="ml-2 px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100"
                        >
                          Use
                        </button>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={onToggleAdd}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Documentation'}
              </button>
            </div>
          </div>
        </form>
      )}

    <div className="space-y-3">
      {trainingData?.documentation?.map((doc: any, index: number) => (
        <div key={index} className="border rounded-lg p-4">
            {editingDoc === doc.id ? (
              <div className="space-y-3">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  rows={3}
                  required
                />
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveEdit(doc.id)}
                    disabled={submitting}
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-sm text-gray-900">{doc.content}</p>
            </div>
            <div className="flex space-x-2 ml-4">
                  <button 
                    onClick={() => handleEdit(doc)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
            </div>
          </div>
            )}
        </div>
      ))}
    </div>
  </div>
);
};

const TrainingQuestions: React.FC<{ 
  trainingData: any; 
  modelId: string; 
  onUpdate: () => void;
  showAdd: boolean;
  onToggleAdd: () => void;
  model: any; // Add model prop for tracked tables
}> = ({ trainingData, modelId, onUpdate, showAdd, onToggleAdd, model }) => {
  const [questions, setQuestions] = useState<any[]>([]);
  

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState({ 
    current: 0, 
    total: 0, 
    generatedQuestions: [] as Array<{
      id: string;
      question: string;
      sql: string;
      involved_columns?: Array<{ table: string; column: string }>;
    }>
  });
  
  // Tracked tables and columns state
  const [trackedTables, setTrackedTables] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<{[tableId: string]: any[]}>({});
  
  // Generation scope state
  const [generationScope, setGenerationScope] = useState({
    tables: [] as string[],
    columns: {} as { [table: string]: string[] },
    numQuestions: 20
  });
  
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

  // Additional features state
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [validatingQuestion, setValidatingQuestion] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<{[key: string]: any[]}>({});
  const [showValidationResults, setShowValidationResults] = useState<Set<string>>(new Set());

  // UI state for questions section
  const [showAIGeneration, setShowAIGeneration] = useState(false);
  const [showManualQuestion, setShowManualQuestion] = useState(false);
  
  // SQL generation state
  const [generatingSql, setGeneratingSql] = useState(false);

  useEffect(() => {
    loadQuestions();
    loadTrackedTables();
  }, [modelId]);

  const loadTrackedTables = async () => {
    try {
      // Import the model service functions
      const { getModelTrackedTables, getModelTrackedColumns } = await import('../../services/models');
      const { getTableColumns } = await import('../../services/connections');
      
      // Load tracked tables
      const tables = await getModelTrackedTables(modelId);

      setTrackedTables(tables);
      
      // Load columns for each tracked table
      for (const table of tables) {
        try {
          // Load database schema columns
          const schemaColumns = await getTableColumns(model.connection_id, table.table_name);
          
          // Load existing tracked columns from backend
          let trackedColumns: any[] = [];
          try {
            trackedColumns = await getModelTrackedColumns(modelId, table.id);
          } catch (error) {
            console.error('❌ Failed to load tracked columns:', error);
            // Continue with empty array
          }
          
          // Merge schema columns with existing tracking information
          const mergedColumns = schemaColumns.map(schemaCol => {
            const trackedCol = trackedColumns.find(tc => tc.column_name === schemaCol.column_name);
            return {
              ...schemaCol,
              id: trackedCol?.id || `temp-${schemaCol.column_name}`, // Preserve the tracked column ID or create temp ID
              is_tracked: trackedCol ? trackedCol.is_tracked : false,
              description: trackedCol?.description || '',
              schema_order: schemaCol.ordinal_position || 999 // Add schema order for sorting
            };
          });
          
          // Sort columns by their position in the database schema
          mergedColumns.sort((a, b) => {
            const orderA = a.schema_order || 999;
            const orderB = b.schema_order || 999;
            return orderA - orderB;
          });
          
          setTableColumns(prev => ({
            ...prev,
            [table.id]: mergedColumns
          }));
        } catch (error) {
          console.error(`Failed to load columns for table ${table.table_name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load tracked tables:', error);
    }
  };

  const loadQuestions = async () => {
    try {
      setError(null);
             const response = await getQuestions(modelId);
       
       
       setQuestions(response.questions || []);
    } catch (err: any) {
      console.error('Failed to load questions:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const generateQuestions = async () => {
    setGenerating(true);
    setError(null);
    setGenerationProgress({ 
      current: 0, 
      total: generationScope.numQuestions, 
      generatedQuestions: [] as Array<{
        id: string;
        question: string;
        sql: string;
        involved_columns?: Array<{ table: string; column: string }>;
      }>
    });
    
    // Automatically infer scope type based on selection
    let inferredType: 'single_table' | 'specific_columns' | 'multiple_tables' | 'multiple_tables_columns';
    
    if (generationScope.tables.length === 0) {
      setError('Please select at least one table');
      setGenerating(false);
      return;
    } else if (generationScope.tables.length === 1) {
      // Single table - check if specific columns are selected
      const hasSpecificColumns = generationScope.columns[generationScope.tables[0]]?.length > 0;
      inferredType = hasSpecificColumns ? 'specific_columns' : 'single_table';
    } else {
      // Multiple tables - check if specific columns are selected
      const hasSpecificColumns = Object.values(generationScope.columns).some(cols => cols.length > 0);
      inferredType = hasSpecificColumns ? 'multiple_tables_columns' : 'multiple_tables';
    }
    
    try {
      await generateEnhancedQuestions(
        modelId,
        {
          type: inferredType,
          tables: generationScope.tables,
          columns: generationScope.columns,
          num_questions: generationScope.numQuestions,
          additional_instructions: additionalInstructions
        },
        (progress) => {
          setGenerationProgress(prev => ({
            ...prev,
            current: progress.current,
            total: progress.total,
            generatedQuestions: [...prev.generatedQuestions, ...progress.generatedQuestions]
          }));
        }
      );
      
      await loadQuestions(); // Reload questions after generation
    } catch (err: any) {
      console.error('Question generation failed:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
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

      await createQuestion(modelId, createData);
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
        is_validated: true
      };

      await updateQuestion(questionId, updateData);
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
      await deleteQuestion(questionId);
      await loadQuestions();
      setDeletingQuestion(null);
    } catch (err: any) {
      console.error('Failed to delete question:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const startEdit = (question: any) => {
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

  const handleValidate = async (questionId: string) => {
    try {
      setValidatingQuestion(questionId);
      
      const result = await validateQuestion(questionId);
      
      // Update validation results
      setValidationResults(prev => ({
        ...prev,
        [questionId]: result.execution_result || []
      }));

      // Update questions list
      const updatedQuestions = questions.map(q => 
        q.id === questionId 
          ? { ...q, is_validated: result.is_validated, validation_notes: result.validation_notes }
          : q
      );
      setQuestions(updatedQuestions);

      // Show results if successful
      if (result.is_validated && result.execution_result) {
        setShowValidationResults(prev => new Set(prev).add(questionId));
      }

    } catch (error) {
      console.error('Failed to validate question:', error);
    } finally {
      setValidatingQuestion(null);
    }
  };

  const toggleValidationResults = (questionId: string) => {
    setShowValidationResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
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

  const handleGenerateSql = async () => {
    if (!formData.question.trim()) {
      setError('Please enter a question first');
      return;
    }

    try {
      setGeneratingSql(true);
      setError(null);
      
      // Send the current generation scope along with the question
      const result = await generateSqlFromQuestions(model.id, [formData.question], {
        tables: generationScope.tables,
        columns: generationScope.columns
      });
      
      if (result.success && result.generated_sql.length > 0) {
        const generatedSql = result.generated_sql[0];
        if (generatedSql.error) {
          setError(`Generation failed: ${generatedSql.error}`);
        } else {
          setFormData(prev => ({
            ...prev,
            sql: generatedSql.sql
          }));
        }
      } else {
        setError('Failed to generate SQL');
      }
    } catch (error: any) {
      console.error('Failed to generate SQL:', error);
      setError(error.response?.data?.detail || 'Failed to generate SQL');
    } finally {
      setGeneratingSql(false);
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
        <div className="mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Training Questions & SQL</h2>
            <p className="text-gray-600">
              Question-SQL pairs that train the AI model
            </p>
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

        {/* Summary Statistics - Moved to top */}
        <div className="grid grid-cols-4 gap-4 mb-6">
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

        {/* Generation Scope Selector - Moved above conditional sections */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Generation Scope</h4>
          
          <div className="grid grid-cols-3 gap-6">
            {/* Tables Panel */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="text-sm font-medium text-gray-900 mb-3">Available Tables</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {trackedTables.length > 0 ? (
                  trackedTables.map((table: any) => (
                    <div
                      key={table.id}
                      onClick={() => {
                        const isSelected = generationScope.tables.includes(table.table_name);
                        if (isSelected) {
                          // Remove table and its columns
                          setGenerationScope(prev => ({
                            ...prev,
                            tables: prev.tables.filter(t => t !== table.table_name),
                            columns: Object.fromEntries(
                              Object.entries(prev.columns).filter(([t]) => t !== table.table_name)
                            )
                          }));
                        } else {
                          // Add table
                          setGenerationScope(prev => ({
                            ...prev,
                            tables: [...prev.tables, table.table_name]
                          }));
                        }
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        generationScope.tables.includes(table.table_name)
                          ? 'bg-blue-100 border-blue-300 text-blue-900'
                          : 'bg-white border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <div className="font-medium text-sm">{table.table_name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {table.schema_name ? `${table.schema_name}.` : ''}{table.table_name}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No tracked tables available</p>
                    <p className="text-xs mt-1">Add tables in the Tracked Tables tab first</p>
                  </div>
                )}
              </div>
            </div>

            {/* Columns Panel */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="text-sm font-medium text-gray-900 mb-3">Available Columns</h5>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {generationScope.tables.length > 0 ? (
                  generationScope.tables.map((tableName: string) => {
                    const table = trackedTables.find((t: any) => t.table_name === tableName);
                    if (!table) return null;
                    
                    const columns = tableColumns[table.id] || [];
                    const trackedColumns = columns.filter((col: any) => col.is_tracked);
                    
                    return (
                      <div key={tableName} className="space-y-2">
                        <div className="text-xs font-medium text-gray-700 bg-gray-200 px-2 py-1 rounded">
                          {tableName} ({trackedColumns.length} tracked)
                        </div>
                        {trackedColumns.map((column: any) => {
                          const isSelected = generationScope.columns[tableName]?.includes(column.column_name) || false;
                          return (
                            <div
                              key={`${tableName}.${column.column_name}`}
                              onClick={() => {
                                const currentColumns = generationScope.columns[tableName] || [];
                                if (isSelected) {
                                  // Remove column
                                  setGenerationScope(prev => ({
                                    ...prev,
                                    columns: {
                                      ...prev.columns,
                                      [tableName]: currentColumns.filter(c => c !== column.column_name)
                                    }
                                  }));
                                } else {
                                  // Add column
                                  setGenerationScope(prev => ({
                                    ...prev,
                                    columns: {
                                      ...prev.columns,
                                      [tableName]: [...currentColumns, column.column_name]
                                    }
                                  }));
                                }
                              }}
                              className={`p-2 rounded border cursor-pointer text-xs transition-colors ${
                                isSelected
                                  ? 'bg-blue-100 border-blue-300 text-blue-900'
                                  : 'bg-white border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              {column.column_name}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">Select tables first</p>
                  </div>
                )}
              </div>
            </div>

            {/* Summary Panel */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="text-sm font-medium text-gray-900 mb-3">Generation Summary</h5>
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="font-medium">Scope:</span>
                  <div className="text-xs text-gray-600 mt-1">
                    {generationScope.tables.length === 0 ? 'No tables selected' :
                     generationScope.tables.length === 1 ? 'Single Table' :
                     Object.values(generationScope.columns).some(cols => cols.length > 0) ? 'Multiple Tables + Columns' :
                     'Multiple Tables'}
                  </div>
                </div>
                
                <div className="text-sm">
                  <span className="font-medium">Tables:</span>
                  <div className="text-xs text-gray-600 mt-1">
                    {generationScope.tables.length > 0 ? (
                      generationScope.tables.map((tableName) => (
                        <div key={tableName} className="flex items-center gap-1">
                          <span>• {tableName}</span>
                        </div>
                      ))
                    ) : (
                      <span>None selected</span>
                    )}
                  </div>
                </div>
                
                <div className="text-sm">
                  <span className="font-medium">Columns:</span>
                  <div className="text-xs text-gray-600 mt-1">
                    {Object.entries(generationScope.columns).some(([_, cols]) => cols.length > 0) ? (
                      Object.entries(generationScope.columns).map(([tableName, columns]) =>
                        columns.length > 0 ? (
                          <div key={tableName}>
                            <span className="font-medium">{tableName}:</span>
                            <div className="ml-2">
                              {columns.map(col => (
                                <span key={col} className="block">• {col}</span>
                              ))}
                            </div>
                          </div>
                        ) : null
                      )
                    ) : (
                      <span>All columns</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons - Completely outside header box */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => {
            setShowManualQuestion(!showManualQuestion);
            setShowAIGeneration(false); // Hide AI generation when showing manual
          }}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus size={16} />
          Add Question
        </button>
        
        <button
          onClick={() => {
            setShowAIGeneration(!showAIGeneration);
            setShowManualQuestion(false); // Hide manual when showing AI generation
          }}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Play size={16} />
          Generate with AI
        </button>
      </div>

      {/* AI Generation Section - Only shown when showAIGeneration is true */}
      {showAIGeneration && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Generate Questions with AI</h3>
          
          <div className="space-y-4">
            {/* Additional Instructions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Instructions for AI Generation
              </label>
              <textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="Provide specific instructions for question generation (e.g., focus on specific topics, use certain terminology, write in Arabic, etc.)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>

            {/* Number of Questions Input Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Questions to Generate
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGenerationScope(prev => ({ ...prev, numQuestions: Math.max(1, prev.numQuestions - 1) }))}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  -
                </button>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={generationScope.numQuestions}
                  onChange={(e) => setGenerationScope(prev => ({ ...prev, numQuestions: parseInt(e.target.value) || 1 }))}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={() => setGenerationScope(prev => ({ ...prev, numQuestions: Math.min(100, prev.numQuestions + 1) }))}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Generation Progress */}
            {generating && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-800 mb-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="font-medium">Generating questions... ({generationProgress.current}/{generationProgress.total})</span>
                </div>
                
                <div className="w-full bg-blue-200 rounded-full h-2 mb-4">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                  ></div>
                </div>

                {generationProgress.generatedQuestions.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <h4 className="text-sm font-medium text-blue-800">Generated Questions:</h4>
                    {generationProgress.generatedQuestions.map((example) => (
                      <div key={example.id} className="bg-white p-3 rounded border text-sm">
                        <div className="font-medium text-gray-900 mb-1">
                          Q: {example.question}
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
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={generateQuestions}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Play size={16} className={generating ? 'animate-spin' : ''} />
              {generating ? 'Generating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowAIGeneration(false);
                setAdditionalInstructions('');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Manual Question Form - Only shown when showManualQuestion is true */}
      {showManualQuestion && (
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
              <div className="flex gap-2">
                <textarea
                  value={formData.sql}
                  onChange={(e) => setFormData(prev => ({ ...prev, sql: e.target.value }))}
                  placeholder="SELECT * FROM ..."
                  rows={4}
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <button
                  onClick={handleGenerateSql}
                  disabled={generatingSql || !formData.question.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  title="Generate SQL from question"
                >
                  {generatingSql ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    'Generate'
                  )}
                </button>
              </div>
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
              onClick={() => {
                setShowManualQuestion(false);
                setFormData({ question: '', sql: '', validation_notes: '' });
              }}
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
            {/* Question Display - Always shown */}
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
                  {question.query_type && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      {question.query_type}
                    </span>
                  )}
                  {question.difficulty && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      {question.difficulty}
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => handleValidate(question.id)}
                    disabled={validatingQuestion === question.id}
                    className="p-1 text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-50"
                    title="Validate Query"
                  >
                    {validatingQuestion === question.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                    ) : (
                      <CheckSquare size={16} />
                    )}
                  </button>
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
              
              {question.involved_columns && question.involved_columns.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Involved Columns</h4>
                  <div className="flex flex-wrap gap-2">
                    {question.involved_columns.map((col: any, idx: number) => (
                      <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                        {col.table}.{col.column}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {question.validation_notes && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Notes</h4>
                  <p className="text-sm text-gray-600 bg-yellow-50 p-2 rounded">{question.validation_notes}</p>
                </div>
              )}

              {/* Query Results */}
              {validationResults[question.id] && showValidationResults.has(question.id) && (
                <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium text-blue-800">Query Results</h4>
                    <button 
                      onClick={() => toggleValidationResults(question.id)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Hide
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-blue-200">
                          {Object.keys(validationResults[question.id][0] || {}).map(key => (
                            <th key={key} className="text-left py-2 px-2 font-medium text-blue-800">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {validationResults[question.id].slice(0, 10).map((row: any, index: number) => (
                          <tr key={index} className="border-b border-blue-100">
                            {Object.values(row).map((value: any, cellIndex: number) => (
                              <td key={cellIndex} className="py-2 px-2 text-blue-700">
                                {String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {validationResults[question.id].length > 10 && (
                      <p className="text-xs text-blue-600 mt-2">
                        Showing first 10 of {validationResults[question.id].length} rows
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="text-xs text-gray-500">
                Created: {new Date(question.created_at).toLocaleString()} | 
                Updated: {new Date(question.updated_at).toLocaleString()}
              </div>
            </div>

            {/* Edit Form - Shown below question when editing */}
            {editingQuestion === question.id && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-4">Edit Question</h4>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes (Optional)</label>
                    <textarea
                      value={formData.validation_notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, validation_notes: e.target.value }))}
                      placeholder="Add any notes about this question-SQL pair..."
                      rows={2}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleUpdate(question.id)}
                      disabled={!formData.question || !formData.sql}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Save size={16} />
                      Update
                    </button>
                    <button
                      onClick={() => {
                        setEditingQuestion(null);
                        setFormData({ question: '', sql: '', validation_notes: '' });
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <X size={16} />
                      Cancel
                    </button>
                  </div>
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
                onClick={() => {
                  setShowManualQuestion(!showManualQuestion);
                  setShowAIGeneration(false); // Hide AI generation when showing manual
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus size={16} />
                Add Question
              </button>
              <button
                onClick={() => {
                  setShowAIGeneration(!showAIGeneration);
                  setShowManualQuestion(false); // Hide manual when showing AI generation
                }}
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

const TablesSchema: React.FC<{ 
  trainingData: any; 
  modelId: string; 
  onUpdate: () => void;
  showAdd: boolean;
  onToggleAdd: () => void;
}> = ({ trainingData, modelId, onUpdate, showAdd, onToggleAdd }) => {
  const [trackedTables, setTrackedTables] = useState<any[]>([]);
  const [tableColumns, setTableColumns] = useState<{[key: string]: any[]}>({});
  const [loading, setLoading] = useState(true);
  const [editingDescription, setEditingDescription] = useState<{tableId: string, columnName: string} | null>(null);
  const [editContent, setEditContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Additional features state
  const [additionalInstructionsColumns, setAdditionalInstructionsColumns] = useState('');

  useEffect(() => {
    loadTrackedTables();
  }, [modelId]);

  const loadTrackedTables = async () => {
    try {
      setLoading(true);
      // Import the model service functions for tracked tables and columns
      const { getModelTrackedTables, getModelTrackedColumns } = await import('../../services/models');
      // Import connection service to get actual column data types
      const { getTableColumns } = await import('../../services/connections');
      
      const tables = await getModelTrackedTables(modelId);

      setTrackedTables(tables);
      
      // Get the model to access its connection_id
      const { getModel } = await import('../../services/models');
      const model = await getModel(modelId);

      
      // For each tracked table, get its tracked columns (which now contain AI descriptions)
      for (const table of tables) {
        try {
          // Get tracked columns for this table
          const trackedColumns = await getModelTrackedColumns(modelId, table.id);

          
          // Get actual column data types from the database schema
          let actualColumns: any[] = [];
          try {
            if (model?.connection_id) {
              actualColumns = await getTableColumns(model.connection_id, table.table_name);

            }
          } catch (error) {
            console.error(`Failed to get actual columns for table ${table.table_name}:`, error);
          }
          
          // Create a map of actual columns by column name for data type lookup
          const actualColumnsMap = new Map();
          actualColumns.forEach((col: any) => {
            actualColumnsMap.set(col.column_name, col);
          });
          
          // Use the same approach as TrainingQuestions - merge schema with tracked columns
          const mergedColumns = actualColumns.map(schemaCol => {
            const trackedCol = trackedColumns.find(tc => tc.column_name === schemaCol.column_name);
            return {
              ...schemaCol,
              id: trackedCol?.id || `temp-${schemaCol.column_name}`, // Preserve the tracked column ID or create temp ID
              is_tracked: trackedCol ? trackedCol.is_tracked : false,
              description: trackedCol?.description || '',
              // Include value information fields from tracked columns
              value_categories: trackedCol?.value_categories || null,
              value_range_min: trackedCol?.value_range_min || null,
              value_range_max: trackedCol?.value_range_max || null,
              value_distinct_count: trackedCol?.value_distinct_count || null,
              value_data_type: trackedCol?.value_data_type || null,
              value_sample_size: trackedCol?.value_sample_size || null,
              schema_order: schemaCol.ordinal_position || 999
            };
          });
          
          // Filter to only show tracked columns
          const tableColumnsData = mergedColumns.filter(col => col.is_tracked);
          
          // Sort columns by their position in the database schema
          tableColumnsData.sort((a, b) => {
            const orderA = a.schema_order || 999;
            const orderB = b.schema_order || 999;
            return orderA - orderB;
          });
          
          // Sort columns by their position in the database schema
          tableColumnsData.sort((a, b) => {
            const orderA = a.schema_order || 999;
            const orderB = b.schema_order || 999;
            return orderA - orderB;
          });
          

          setTableColumns(prev => ({
            ...prev,
            [table.id]: tableColumnsData
          }));
        } catch (error) {
          console.error(`Failed to process table ${table.table_name}:`, error);
          setTableColumns(prev => ({
            ...prev,
            [table.id]: []
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load tracked tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditDescription = (tableId: string, columnName: string, currentDescription: string) => {
    setEditingDescription({ tableId, columnName });
    setEditContent(currentDescription);
  };

  const handleSaveDescription = async () => {
    if (!editingDescription) return;
    
    try {
      setSubmitting(true);
      
      // Find the column to update
      const columns = tableColumns[editingDescription.tableId];
      const columnToUpdate = columns.find((col: any) => col.column_name === editingDescription.columnName);
      
      if (columnToUpdate) {
        // Check if this is a temporary column (has temp- prefix in ID)
        if (columnToUpdate.id && columnToUpdate.id.startsWith('temp-')) {
          // This is a temporary column, we need to create a real training column first

          const { createColumn } = await import('../../services/training');
          
          // Find the table name for this column
          const table = trackedTables.find(t => t.id === editingDescription.tableId);
          if (table) {
            const newTrainingColumn = await createColumn(modelId, {
              table_name: table.table_name,
              column_name: columnToUpdate.column_name,
              data_type: columnToUpdate.data_type || columnToUpdate.column_type || 'Unknown',
              description: editContent
            });
            
            // Update local state with the new real training column
            const updatedColumns = columns.map((col: any) => {
              if (col.column_name === editingDescription.columnName) {
                return { ...newTrainingColumn, description: editContent };
              }
              return col;
            });
            
            setTableColumns(prev => ({
              ...prev,
              [editingDescription.tableId]: updatedColumns
            }));
          }
        } else {
          // This is a real training column, update it normally
          const { updateColumn } = await import('../../services/training');
          await updateColumn(columnToUpdate.id, {
            description: editContent
          });
          
          // Update local state
          const updatedColumns = columns.map((col: any) => {
            if (col.column_name === editingDescription.columnName) {
              return { ...col, description: editContent };
            }
            return col;
          });
          
          setTableColumns(prev => ({
            ...prev,
            [editingDescription.tableId]: updatedColumns
          }));
        }
      }
      
      setEditingDescription(null);
      setEditContent('');
    } catch (error) {
      console.error('Failed to update column description:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingDescription(null);
    setEditContent('');
  };

  const handleGenerateAIDescription = async (tableId: string, columnName: string, dataType: string) => {
    try {

      setSubmitting(true);
      
      // Find the column to update
      const columns = tableColumns[tableId];
      const columnToUpdate = columns.find((col: any) => col.column_name === columnName);
      

      
      if (columnToUpdate) {
        // Find the table name for this column
        const table = trackedTables.find(t => t.id === tableId);

        
        if (table) {

          
          // Call the AI generation endpoint
          const { generateColumnDescriptions } = await import('../../services/training');
          
          const result = await generateColumnDescriptions(
            modelId, 
            'column', 
            table.table_name, 
            columnName,
            additionalInstructionsColumns
          );
          

          
          if (result.success) {

            // Update the local state with the new description instead of reloading
            setTableColumns(prevColumns => {
              const updatedColumns = { ...prevColumns };
              if (updatedColumns[tableId]) {
                updatedColumns[tableId] = updatedColumns[tableId].map((col: any) => {
                  if (col.column_name === columnName) {
                    return { ...col, description: result.generated_descriptions?.[columnName] || col.description };
                  }
                  return col;
                });
              }
              return updatedColumns;
            });
          } else {
            console.error('Failed to generate AI description:', result.error_message);
          }
        }
      }
    } catch (error) {
      console.error('Failed to generate AI description:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateTableDescriptions = async (tableId: string) => {
    try {

      setSubmitting(true);
      
      const table = trackedTables.find(t => t.id === tableId);
      if (table) {
        const { generateTableDescriptions } = await import('../../services/training');
        

        const result = await generateTableDescriptions(modelId, table.table_name, additionalInstructionsColumns);

        
        if (result.success) {

          
          // Update the local state with the new descriptions instead of reloading
          if (result.generated_descriptions) {

            setTableColumns(prevColumns => {
              const updatedColumns = { ...prevColumns };
              if (updatedColumns[tableId]) {
                updatedColumns[tableId] = updatedColumns[tableId].map((col: any) => {
                  const tableDescriptions = result.generated_descriptions[table.table_name];
                  const newDescription = tableDescriptions ? tableDescriptions[col.column_name] : null;
                  if (newDescription) {

                    return { ...col, description: newDescription };
                  }
                  return col;
                });
              }
              return updatedColumns;
            });
          }
        } else {
          console.error('Failed to generate table descriptions:', result.error_message);
        }
      }
    } catch (error) {
      console.error('Failed to generate table descriptions:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateAllDescriptions = async () => {
    try {

      
      setSubmitting(true);
      
      const { generateAllDescriptionsSSE } = await import('../../services/training');
      const { sseConnection } = await import('../../services/sse');

      
      // Get the SSE stream URL
      const streamUrl = await generateAllDescriptionsSSE(modelId, additionalInstructionsColumns);

      
      // Connect to SSE stream
      sseConnection.connect(streamUrl, {
        onProgress: (data) => {
          // You can add progress UI here if needed
        },
        onCompleted: (data) => {
          if (data.generated_count > 0) {
            // Update the local state with the new descriptions instead of reloading
            // The SSE response should include the generated descriptions
            if (data.generated_descriptions) {
              setTableColumns(prevColumns => {
                const updatedColumns = { ...prevColumns };
                Object.entries(data.generated_descriptions).forEach(([tableName, tableDescriptions]: [string, any]) => {
                  // Find the table ID for this table name
                  const table = trackedTables.find(t => t.table_name === tableName);
                  if (table && updatedColumns[table.id]) {
                    updatedColumns[table.id] = updatedColumns[table.id].map((col: any) => {
                      const newDescription = tableDescriptions[col.column_name];
                      if (newDescription) {
                        return { ...col, description: newDescription };
                      }
                      return col;
                    });
                  }
                });
                return updatedColumns;
              });
            }
          }
          setSubmitting(false);
        },
        onError: (data) => {
          console.error('❌ SSE Error:', data);
          setSubmitting(false);
        }
      });
      
    } catch (error) {
      console.error('Failed to generate all descriptions:', error);
      setSubmitting(false);
    }
  };

  const formatValueInfo = (column: any) => {
    if (!column.value_categories && !column.value_range_min && !column.value_range_max) {
      return null;
    }

    // For numerical columns, prioritize showing range over categories
    if (column.value_range_min && column.value_range_max) {
      return (
        <div className="text-xs text-gray-600 mt-1">
          <span className="font-medium">Range:</span> {column.value_range_min} to {column.value_range_max}
        </div>
      );
    }

    // For categorical columns (no range), show categories
    if (column.value_categories && column.value_categories.length > 0) {
      const displayValues = column.value_categories.slice(0, 3);
      const totalDistinct = column.value_distinct_count || column.value_categories.length;
      const remaining = totalDistinct - 3;
      return (
        <div className="text-xs text-gray-600 mt-1">
          <span className="font-medium">Values:</span> {displayValues.join(', ')}
          {remaining > 0 && <span className="text-gray-500"> +{remaining} more ({totalDistinct} total)</span>}
        </div>
      );
    }

    return null;
  };



  if (loading) {
    return (
  <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
    <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
    );
  }



  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Tables Schema</h4>
          <p className="text-sm text-gray-500">Manage column descriptions for tracked tables</p>
        </div>
        <button
          onClick={handleGenerateAllDescriptions}
          disabled={submitting}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Generating...' : 'Generate All Descriptions'}
        </button>
      </div>

      {/* Additional Instructions for Columns */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Additional Instructions for AI Generation
        </label>
        <textarea
          value={additionalInstructionsColumns}
          onChange={(e) => setAdditionalInstructionsColumns(e.target.value)}
          placeholder="Provide specific instructions for column description generation"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
        />
      </div>
      
      {trackedTables.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No tracked tables found. Add tables in the Tracked Tables tab first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {trackedTables.map((table) => {
            
            return (
              <div key={table.id} className="border rounded-lg">
                <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                  <h5 className="text-sm font-medium text-gray-900">{table.table_name}</h5>
                  <button
                    onClick={() => handleGenerateTableDescriptions(table.id)}
                    disabled={submitting}
                    className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {submitting ? 'Generating...' : 'Generate All'}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Column Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Data Type
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tableColumns[table.id]?.length > 0 ? (
                                                 tableColumns[table.id].map((column: any, index: number) => {
                           return (
                          <tr key={index}>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {column.column_name}
                            </td>
                                                         <td className="px-4 py-3 text-sm text-gray-500">
                               {column.data_type || column.column_type || 'Unknown'}
                             </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {editingDescription?.tableId === table.id && editingDescription?.columnName === column.column_name ? (
                                <textarea
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                  rows={2}
                                />
                              ) : (
                                <div>
                                  <span className={column.description ? 'text-gray-900' : 'text-gray-400 italic'}>
                                    {column.description || 'No description'}
                                  </span>
                                  {formatValueInfo(column)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {editingDescription?.tableId === table.id && editingDescription?.columnName === column.column_name ? (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={handleSaveDescription}
                                    disabled={submitting}
                                    className="text-indigo-600 hover:text-indigo-900 text-xs"
                                  >
                                    {submitting ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="text-gray-600 hover:text-gray-900 text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleEditDescription(table.id, column.column_name, column.description || '')}
                                    className="text-indigo-600 hover:text-indigo-900 text-xs"
                                  >
                                    Edit
                                  </button>
                                                                     <button
                                     onClick={() => handleGenerateAIDescription(table.id, column.column_name, column.data_type || column.column_type || 'Unknown')}
                                     disabled={submitting}
                                     className="text-green-600 hover:text-green-900 text-xs"
                                   >
                                    {submitting ? 'Generating...' : 'AI Generate'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          );
                        })
                                             ) : (
                         <tr>
                           <td colSpan={4} className="px-4 py-3 text-sm text-gray-500 text-center">
                             No tracked columns found for this table. Track columns in the Tracked Tables tab first.
                           </td>
                         </tr>
                       )}
                    </tbody>
                  </table>
    </div>
  </div>
);
          })}
        </div>
      )}
    </div>
  );
};

export default ModelTraining;
