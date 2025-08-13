import React, { useState } from 'react';
import { ModelDetail } from '../../types/models';
import { updateModel } from '../../services/models';

interface ModelOverviewProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
}

const ModelOverview: React.FC<ModelOverviewProps> = ({ model, onModelUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    try {
      setLoading(true);
      const updatedModel = await updateModel(model.id, {
        name,
        description: description || undefined,
      });
      // The updated model is a basic Model, not ModelDetail, so we need to merge it with the current model
      onModelUpdate({
        ...model,
        ...updatedModel
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update model:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setName(model.name);
    setDescription(model.description || '');
    setIsEditing(false);
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
    <div className="space-y-6">
      {/* Model Details Card */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Model Details</h3>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Edit
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{model.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <p className="mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
                  {model.status}
                </span>
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Description</label>
              {isEditing ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter model description..."
                />
              ) : (
                <p className="mt-1 text-sm text-gray-900">{model.description || 'No description provided'}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Tracked Tables</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {model.tracked_tables?.length || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Training Data</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {model.training_documentation?.length || 0} docs
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Questions</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {model.training_questions?.length || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Last Updated</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {model.updated_at ? new Date(model.updated_at).toLocaleDateString() : 'Never'}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Information */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Connection Information</h3>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Connection ID</label>
              <p className="mt-1 text-sm text-gray-900">{model.connection_id || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Model Status</label>
              <p className="mt-1 text-sm text-gray-900 capitalize">{model.status || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">User ID</label>
              <p className="mt-1 text-sm text-gray-900">{model.user_id || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Model ID</label>
              <p className="mt-1 text-sm text-gray-900">{model.id || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tracked Tables */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Tracked Tables</h3>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-4">
            {model.tracked_tables?.map((table, index) => (
              <div key={index} className="bg-gray-100 p-3 rounded-md">
                <p className="text-sm text-gray-900">{table.table_name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Training Documentation */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Training Documentation</h3>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-4">
            {model.training_documentation?.map((doc, index) => (
              <div key={index} className="bg-gray-100 p-3 rounded-md">
                <p className="text-sm text-gray-900">{doc.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Training Questions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Training Questions</h3>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-4">
            {model.training_questions?.map((question, index) => (
              <div key={index} className="bg-gray-100 p-3 rounded-md">
                <p className="text-sm text-gray-900">{question.question}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelOverview;
