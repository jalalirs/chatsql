import React, { useState } from 'react';
import { ModelDetail } from '../../types/models';
import { archiveModel, activateModel, duplicateModel, deleteModel } from '../../services/models';

interface ModelHeaderProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
  onBack: () => void;
}

const ModelHeader: React.FC<ModelHeaderProps> = ({ model, onModelUpdate, onBack }) => {
  const [loading, setLoading] = useState(false);

  const handleArchive = async () => {
    try {
      setLoading(true);
      await archiveModel(model.id);
      // Archive operation returns boolean, so we need to reload the model
      // For now, we'll just update the status locally
      onModelUpdate({
        ...model,
        status: 'archived' as any
      });
    } catch (error) {
      console.error('Failed to archive model:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    try {
      setLoading(true);
      await activateModel(model.id);
      // Activate operation returns boolean, so we need to reload the model
      // For now, we'll just update the status locally
      onModelUpdate({
        ...model,
        status: 'active' as any
      });
    } catch (error) {
      console.error('Failed to activate model:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      setLoading(true);
      const duplicatedModel = await duplicateModel(model.id);
      // The duplicated model is a basic Model, not ModelDetail, so we need to navigate to it
      window.location.href = `/models/${duplicatedModel.id}`;
    } catch (error) {
      console.error('Failed to duplicate model:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this model? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await deleteModel(model.id);
      onBack();
    } catch (error) {
      console.error('Failed to delete model:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      case 'training':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{model.name}</h1>
              <div className="flex items-center space-x-4 mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
                  {model.status}
                </span>
                <span className="text-sm text-gray-500">
                  {model.tracked_tables?.length || 0} tables tracked
                </span>
                <span className="text-sm text-gray-500">
                  Created {new Date(model.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {model.status === 'active' ? (
              <button
                onClick={handleArchive}
                disabled={loading}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Archive
              </button>
            ) : (
              <button
                onClick={handleActivate}
                disabled={loading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Activate
              </button>
            )}

            <button
              onClick={handleDuplicate}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Duplicate
            </button>

            <button
              onClick={handleDelete}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelHeader;
