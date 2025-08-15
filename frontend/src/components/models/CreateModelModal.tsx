import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Connection } from '../../types/chat';
import { createModel } from '../../services/models';
import { getConnections } from '../../services/connections';

interface CreateModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModelCreated: (modelId: string) => void;
}

const CreateModelModal: React.FC<CreateModelModalProps> = ({ isOpen, onClose, onModelCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConnections();
    }
  }, [isOpen]);

  const loadConnections = async () => {
    try {
      setConnectionsLoading(true);
      const connectionsData = await getConnections();
      setConnections(connectionsData.connections);
    } catch (error) {
      console.error('Failed to load connections:', error);
      setError('Failed to load connections');
    } finally {
      setConnectionsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !selectedConnectionId) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const newModel = await createModel({
        name: name.trim(),
        description: description.trim() || undefined,
        connection_id: selectedConnectionId,
      });
      
      onModelCreated(newModel.id);
      handleClose();
    } catch (err) {
      console.error('Failed to create model:', err);
      setError(err instanceof Error ? err.message : 'Failed to create model');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setSelectedConnectionId(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create New Model</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Model Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter model name"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter model description (optional)"
            />
          </div>

          <div>
            <label htmlFor="connection" className="block text-sm font-medium text-gray-700 mb-1">
              Database Connection *
            </label>
            {connectionsLoading ? (
              <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                <div className="animate-pulse h-4 bg-gray-200 rounded"></div>
              </div>
            ) : (
              <select
                id="connection"
                value={selectedConnectionId || ''}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select a connection</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name} ({connection.driver || 'SQL Server'})
                  </option>
                ))}
              </select>
            )}
            {connections.length === 0 && !connectionsLoading && (
              <p className="mt-1 text-sm text-gray-500">
                No connections available. Create a connection first.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !selectedConnectionId}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Model'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateModelModal;
