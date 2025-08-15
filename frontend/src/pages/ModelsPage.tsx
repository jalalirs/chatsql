import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit, 
  Copy, 
  Archive, 
  Trash2, 
  Play,
  Database,
  Brain,
  Clock,
  CheckCircle,
  AlertCircle,
  Zap
} from 'lucide-react';
import { Model } from '../types/models';
import { modelService } from '../services/models';
import { api } from '../services/auth';
import CreateModelModal from '../components/models/CreateModelModal';

export const ModelsPage: React.FC = () => {
  const navigate = useNavigate();
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalModels, setTotalModels] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadModels();
  }, [page, statusFilter]);

  const loadModels = async () => {
    try {
      setLoading(true);
      const response = await modelService.getModels(page, 20, statusFilter || undefined);
      setModels(response.models);
      setTotalPages(Math.ceil(response.total / 20));
      setTotalModels(response.total);
    } catch (err: any) {
      console.error('Failed to load models:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'trained':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', text: 'Trained' };
      case 'training':
        return { icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'Training' };
      case 'active':
        return { icon: Play, color: 'text-blue-600', bg: 'bg-blue-100', text: 'Active' };
      case 'draft':
        return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', text: 'Draft' };
      case 'archived':
        return { icon: Archive, color: 'text-gray-500', bg: 'bg-gray-50', text: 'Archived' };
      case 'training_failed':
        return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100', text: 'Training Failed' };
      default:
        return { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-100', text: 'Unknown' };
    }
  };

  const handleModelAction = async (modelId: string, action: string) => {
    try {
      switch (action) {
        case 'archive':
          await modelService.archiveModel(modelId);
          break;
        
          break;
        case 'duplicate':
          await modelService.duplicateModel(modelId);
          break;
        case 'delete':
          if (window.confirm('Are you sure you want to delete this model? This action cannot be undone.')) {
            await modelService.deleteModel(modelId);
          }
          break;
      }
      loadModels(); // Refresh the list
    } catch (err: any) {
      console.error(`Failed to ${action} model:`, err);
      alert(`Failed to ${action} model: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleModelCreated = (modelId: string) => {
    // Navigate to the new model detail page
    navigate(`/models/${modelId}`);
  };

  const filteredModels = models.filter(model =>
    model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.connection_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && models.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading models...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <nav className="flex items-center text-sm">
                <button
                  onClick={() => navigate('/')}
                  className="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                >
                  Chat
                </button>
                <span className="text-gray-400">/</span>
                <span className="text-gray-900 font-medium px-2">Models</span>
              </nav>
            </div>
            
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Create Model
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters and Search */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search models..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="training">Training</option>
              <option value="trained">Trained</option>
              <option value="archived">Archived</option>
              <option value="training_failed">Training Failed</option>
            </select>
          </div>
        </div>

        {/* Models Grid */}
        {error ? (
          <div className="text-center py-8">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Models</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={loadModels}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="text-center py-12">
            <Brain size={64} className="mx-auto text-gray-400 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Models Found</h2>
            <p className="text-gray-600 mb-6">
              {searchTerm || statusFilter ? 'No models match your search criteria.' : 'Get started by creating your first model.'}
            </p>
            {!searchTerm && !statusFilter && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
              >
                <Plus size={16} />
                Create Your First Model
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredModels.map((model) => {
              const statusInfo = getStatusInfo(model.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div key={model.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{model.name}</h3>
                        {model.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{model.description}</p>
                        )}
                      </div>
                      
                      {/* Actions Menu */}
                      <div className="relative">
                        <button className="p-1 hover:bg-gray-100 rounded">
                          <MoreVertical size={16} />
                        </button>
                        {/* Dropdown menu would go here */}
                      </div>
                    </div>

                    {/* Connection Info */}
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                      <Database size={14} />
                      <span>{model.connection_id}</span>
                    </div>

                    {/* Status */}
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${statusInfo.bg} ${statusInfo.color} mb-4`}>
                      <StatusIcon size={14} />
                      <span className="font-medium">{statusInfo.text}</span>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Status</p>
                        <p className="font-semibold">{model.status}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Created</p>
                        <p className="font-semibold">{new Date(model.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => navigate(`/models/${model.id}`)}
                        className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        View Details
                      </button>
                      
                      {model.status === 'trained' && (
                        <button
                          onClick={() => navigate('/', { state: { selectedModelId: model.id } })}
                          className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                        >
                          Use in Chat
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, totalModels)} of {totalModels} models
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
                className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Create Model Modal */}
        <CreateModelModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onModelCreated={handleModelCreated}
        />
      </div>
    </div>
  );
};
