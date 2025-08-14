import React, { useState, useEffect } from 'react';
import { ModelDetail } from '../../types/models';
import { 
  getTrainingData, 
  trainModel,
  createDocumentation,
  createQuestion,
  createColumn,
  updateDocumentation,
  deleteDocumentation
} from '../../services/training';
import { getTemplates, DocumentationTemplate } from '../../services/templates';

interface ModelTrainingProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
}

const ModelTraining: React.FC<ModelTrainingProps> = ({ model, onModelUpdate }) => {
  const [trainingData, setTrainingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [activeTab, setActiveTab] = useState<'documentation' | 'questions' | 'columns'>('documentation');
  const [showAddDocumentation, setShowAddDocumentation] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);

  useEffect(() => {
    loadTrainingData();
  }, [model.id]);

  const loadTrainingData = async () => {
    try {
      setLoading(true);
      const data = await getTrainingData(model.id);
      setTrainingData(data);
    } catch (error) {
      console.error('Failed to load training data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrainModel = async () => {
    try {
      setTraining(true);
      await trainModel(model.id);
      // Refresh model data to get updated status
      // This would typically be handled by a real-time update or polling
    } catch (error) {
      console.error('Failed to train model:', error);
    } finally {
      setTraining(false);
    }
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
      {/* Training Overview */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Training Overview</h3>
            <div className="flex space-x-3">
              <button
                onClick={handleTrainModel}
                disabled={training || model.status === 'training' || !trainingData}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {training ? 'Training...' : 'Train Model'}
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Documentation</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {trainingData?.documentation?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Questions</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {trainingData?.questions?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Columns</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {trainingData?.columns?.length || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
}> = ({ trainingData, modelId, onUpdate, showAdd, onToggleAdd }) => {
  const [newQuestion, setNewQuestion] = useState({
    question: '',
    answer: '',
    table_name: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await createQuestion(modelId, {
        question: newQuestion.question,
        sql: newQuestion.answer,
        generated_by: 'manual'
      });
      setNewQuestion({ question: '', answer: '', table_name: '' });
      onToggleAdd();
      onUpdate();
    } catch (error) {
      console.error('Failed to add question:', error);
      // TODO: Add proper error handling/notification
    } finally {
      setSubmitting(false);
    }
  };

  return (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <h4 className="text-sm font-medium text-gray-900">Questions & Answers</h4>
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
              <label className="block text-sm font-medium text-gray-700">Question</label>
              <input
                type="text"
                value={newQuestion.question}
                onChange={(e) => setNewQuestion({...newQuestion, question: e.target.value})}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Enter question..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Answer</label>
              <textarea
                value={newQuestion.answer}
                onChange={(e) => setNewQuestion({...newQuestion, answer: e.target.value})}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                rows={3}
                placeholder="Enter answer..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Table Name</label>
              <input
                type="text"
                value={newQuestion.table_name}
                onChange={(e) => setNewQuestion({...newQuestion, table_name: e.target.value})}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="Enter table name..."
                required
              />
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
                {submitting ? 'Adding...' : 'Add Question'}
              </button>
            </div>
    </div>
        </form>
      )}

    <div className="space-y-3">
      {trainingData?.questions?.map((q: any, index: number) => (
        <div key={index} className="border rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Q: {q.question}</p>
              <p className="text-sm text-gray-600 mt-2">A: {q.answer}</p>
              <p className="text-xs text-gray-500 mt-2">Table: {q.table_name}</p>
            </div>
            <div className="flex space-x-2 ml-4">
              <button className="text-sm text-gray-500 hover:text-gray-700">Edit</button>
              <button className="text-sm text-red-600 hover:text-red-700">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
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
      console.log('🔍 Tracked tables:', tables);
      setTrackedTables(tables);
      
      // Get the model to access its connection_id
      const { getModel } = await import('../../services/models');
      const model = await getModel(modelId);
      console.log('🔍 Model:', model);
      
      // For each tracked table, get its tracked columns (which now contain AI descriptions)
      for (const table of tables) {
        try {
          // Get tracked columns for this table
          const trackedColumns = await getModelTrackedColumns(modelId, table.id);
          console.log(`🔍 Tracked columns for table ${table.table_name}:`, trackedColumns);
          
          // Get actual column data types from the database schema
          let actualColumns: any[] = [];
          try {
            if (model?.connection_id) {
              actualColumns = await getTableColumns(model.connection_id, table.table_name);
              console.log(`🔍 Actual columns for table ${table.table_name}:`, actualColumns);
            }
          } catch (error) {
            console.error(`Failed to get actual columns for table ${table.table_name}:`, error);
          }
          
          // Create a map of actual columns by column name for data type lookup
          const actualColumnsMap = new Map();
          actualColumns.forEach((col: any) => {
            actualColumnsMap.set(col.column_name, col);
          });
          
          // Use tracked columns directly (they now contain AI descriptions)
          const tableColumnsData: any[] = [];
          for (const trackedCol of trackedColumns) {
            if (trackedCol.is_tracked) {
              // Get the actual data type from the database schema
              const actualCol = actualColumnsMap.get(trackedCol.column_name);
              const dataType = actualCol ? actualCol.data_type : 'Unknown';
              
              tableColumnsData.push({
                ...trackedCol,
                data_type: dataType,
                description: trackedCol.description || '',
                description_source: 'manual' // Will be updated when AI generates descriptions
              });
            }
          }
          
          console.log(`🔍 Table ${table.table_name} has ${tableColumnsData.length} columns for display`);
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
          console.log(`🔍 Creating real training column for ${columnToUpdate.column_name}`);
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
            columnName
          );
          
          if (result.success) {
            // Reload the data to get the updated descriptions
            // Add a small delay to ensure the database has time to update
            setTimeout(async () => {
              await loadTrackedTables();
            }, 1000);
          } else {
            console.error('Failed to generate AI description:', result.message);
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
        const result = await generateTableDescriptions(modelId, table.table_name);
        
        if (result.success) {
          console.log('✅ Successfully generated table descriptions:', result.message);
          
          // Reload the tracked columns to get the updated descriptions
          await loadTrackedTables();
        } else {
          console.error('Failed to generate table descriptions:', result.message);
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
      
      const { generateAllDescriptions } = await import('../../services/training');
      const result = await generateAllDescriptions(modelId);
      
      if (result.success) {
        console.log('✅ Successfully generated all descriptions:', result.message);
        
        // Reload the tracked columns to get the updated descriptions
        await loadTrackedTables();
      } else {
        console.error('Failed to generate all descriptions:', result.message);
      }
    } catch (error) {
      console.error('Failed to generate all descriptions:', error);
    } finally {
      setSubmitting(false);
    }
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

    // Debug logging
  console.log('🔍 Rendering - trackedTables:', trackedTables);
  console.log('🔍 Rendering - tableColumns:', tableColumns);

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
      
      {trackedTables.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No tracked tables found. Add tables in the Tracked Tables tab first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {trackedTables.map((table) => {
            // Debug logging
            console.log(`🔍 Rendering table ${table.table_name} with columns:`, tableColumns[table.id]);
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
                          console.log(`🔍 Rendering column ${column.column_name}:`, column);
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
                                <span className={column.description ? 'text-gray-900' : 'text-gray-400 italic'}>
                                  {column.description || 'No description'}
                                </span>
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
