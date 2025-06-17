import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { Connection } from '../../types/chat';
import { trainingService, TrainingDocumentation, DocumentationCreateRequest, DocumentationUpdateRequest } from '../../services/training';

interface DocumentationTabProps {
  connection: Connection;
  onConnectionUpdate: (connection: Connection) => void;
}

export const DocumentationTab: React.FC<DocumentationTabProps> = ({ connection, onConnectionUpdate }) => {
  const [documentation, setDocumentation] = useState<TrainingDocumentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<string | null>(null);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  // Form state for creating/editing
  const [formData, setFormData] = useState({
    title: '',
    doc_type: '',
    content: '',
    category: '',
    order_index: 0
  });

  useEffect(() => {
    loadDocumentation();
  }, [connection.id]);

  const loadDocumentation = async () => {
    try {
      setError(null);
      const response = await trainingService.getDocumentation(connection.id);
      setDocumentation(response.documentation);
    } catch (err: any) {
      console.error('Failed to load documentation:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const createData: DocumentationCreateRequest = {
        title: formData.title,
        doc_type: formData.doc_type,
        content: formData.content,
        category: formData.category || undefined,
        order_index: formData.order_index
      };

      const newDoc = await trainingService.createDocumentation(connection.id, createData);
      setDocumentation(prev => [...prev, newDoc]);
      setCreatingDoc(false);
      resetForm();
    } catch (err: any) {
      console.error('Failed to create documentation:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleUpdate = async (docId: string) => {
    try {
      const updateData: DocumentationUpdateRequest = {
        title: formData.title,
        doc_type: formData.doc_type,
        content: formData.content,
        category: formData.category || undefined,
        order_index: formData.order_index
      };

      const updatedDoc = await trainingService.updateDocumentation(connection.id, docId, updateData);
      setDocumentation(prev => prev.map(doc => doc.id === docId ? updatedDoc : doc));
      setEditingDoc(null);
      resetForm();
    } catch (err: any) {
      console.error('Failed to update documentation:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleDelete = async (docId: string) => {
    try {
      await trainingService.deleteDocumentation(connection.id, docId);
      setDocumentation(prev => prev.filter(doc => doc.id !== docId));
      setDeletingDoc(null);
    } catch (err: any) {
      console.error('Failed to delete documentation:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const startEdit = (doc: TrainingDocumentation) => {
    setFormData({
      title: doc.title,
      doc_type: doc.doc_type,
      content: doc.content,
      category: doc.category || '',
      order_index: doc.order_index
    });
    setEditingDoc(doc.id);
  };

  const startCreate = () => {
    resetForm();
    setCreatingDoc(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      doc_type: '',
      content: '',
      category: '',
      order_index: 0
    });
  };

  const cancelEdit = () => {
    setEditingDoc(null);
    setCreatingDoc(false);
    resetForm();
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'system':
        return 'bg-blue-100 text-blue-800';
      case 'columns':
        return 'bg-green-100 text-green-800';
      case 'descriptions':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const groupedDocs = documentation.reduce((groups, doc) => {
    const category = doc.category || 'general';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(doc);
    return groups;
  }, {} as Record<string, TrainingDocumentation[]>);

  // Sort categories: system first, then alphabetical
  const sortedCategories = Object.keys(groupedDocs).sort((a, b) => {
    if (a === 'system') return -1;
    if (b === 'system') return 1;
    return a.localeCompare(b);
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            <span className="text-gray-600">Loading documentation...</span>
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
            <h2 className="text-lg font-medium text-gray-900">Training Documentation</h2>
            <p className="text-gray-600">
              Manage documentation and guides that help train the AI model for <strong>{connection.table_name}</strong>
            </p>
          </div>
          
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Add Documentation
          </button>
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

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{documentation.length}</div>
            <div className="text-sm text-blue-700">Total Documents</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">
              {Object.keys(groupedDocs).length}
            </div>
            <div className="text-sm text-green-700">Categories</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-600">
              {documentation.filter(doc => doc.is_active).length}
            </div>
            <div className="text-sm text-purple-700">Active Documents</div>
          </div>
        </div>
      </div>

      {/* Create Form */}
      {creatingDoc && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Documentation</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Documentation title"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
              <input
                type="text"
                value={formData.doc_type}
                onChange={(e) => setFormData(prev => ({ ...prev, doc_type: e.target.value }))}
                placeholder="e.g., table_info, custom_rules"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select category</option>
                <option value="system">System</option>
                <option value="columns">Columns</option>
                <option value="descriptions">Descriptions</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Order Index</label>
              <input
                type="number"
                value={formData.order_index}
                onChange={(e) => setFormData(prev => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Documentation content..."
              rows={6}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={!formData.title || !formData.doc_type || !formData.content}
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

      {/* Documentation by Category */}
      {sortedCategories.map(category => (
        <div key={category} className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 capitalize">
            {category} Documentation ({groupedDocs[category].length})
          </h3>
          
          <div className="space-y-4">
            {groupedDocs[category]
              .sort((a, b) => a.order_index - b.order_index)
              .map((doc: TrainingDocumentation) => (
                <div key={doc.id} className="border border-gray-200 rounded-lg p-4">
                  {editingDoc === doc.id ? (
                    // Edit Form
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                          <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                          <input
                            type="text"
                            value={formData.doc_type}
                            onChange={(e) => setFormData(prev => ({ ...prev, doc_type: e.target.value }))}
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                        <textarea
                          value={formData.content}
                          onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                          rows={4}
                          className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(doc.id)}
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
                          <h4 className="font-medium text-gray-900">{doc.title}</h4>
                          <span className={`px-2 py-1 text-xs rounded-full ${getCategoryColor(doc.category || '')}`}>
                            {doc.doc_type}
                          </span>
                          {doc.is_active && (
                            <span className="flex items-center gap-1 text-green-600 text-sm">
                              <CheckCircle size={14} />
                              Active
                            </span>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(doc)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setDeletingDoc(doc.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="bg-gray-50 rounded p-3">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                          {doc.content}
                        </pre>
                      </div>
                      
                      <div className="mt-2 text-xs text-gray-500">
                        Created: {new Date(doc.created_at).toLocaleString()} | 
                        Updated: {new Date(doc.updated_at).toLocaleString()} | 
                        Order: {doc.order_index}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}

      {/* Empty State */}
      {documentation.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-center py-8">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Documentation</h3>
            <p className="text-gray-600 mb-4">
              Add documentation to help train the AI model with context about your data and business rules.
            </p>
            <button
              onClick={startCreate}
              className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Add First Document
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Delete Documentation</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this documentation? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deletingDoc)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setDeletingDoc(null)}
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