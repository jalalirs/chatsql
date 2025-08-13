import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Database, ArrowLeft, MoreVertical, Play, Zap, AlertCircle, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { Connection } from '../types/chat';
import { chatService } from '../services/chat';
import { ConnectionSetupModal } from '../components/connection/ConnectionSetupModal';
import { api } from '../services/auth';

export const ConnectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [deletingConnection, setDeletingConnection] = useState<Connection | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      console.log('Loading connections...');
      const connectionsData: any = await chatService.getConnections();
      console.log('Connections data:', connectionsData);
      
      // Handle the backend response format: {connections: [...], total: number}
      let connections: Connection[] = []; // Add explicit type here
      if (connectionsData && Array.isArray(connectionsData.connections)) {
        connections = connectionsData.connections;
      } else if (Array.isArray(connectionsData)) {
        connections = connectionsData;
      } else {
        console.error('Unexpected connections data format:', connectionsData);
        connections = []; // Ensure it's always an array
      }
      
      setConnections(connections);
    } catch (error) {
      console.error('Failed to load connections:', error);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConnection = async () => {
    if (!deletingConnection) return;
    
    setDeleteLoading(true);
    try {
      console.log('Deleting connection:', deletingConnection.id);
      
      const response = await api.delete(`/connections/${deletingConnection.id}`);
      console.log('Delete response:', response.data);
      
      // Remove from local state
      setConnections(prev => prev.filter(conn => conn.id !== deletingConnection.id));
      
      // Show success message (optional)
      console.log(`Connection "${deletingConnection.name}" deleted successfully`);
      
    } catch (error: any) {
      console.error('Failed to delete connection:', error);
      alert(`Failed to delete connection: ${error.response?.data?.detail || error.message}`);
    } finally {
      setDeleteLoading(false);
      setDeletingConnection(null);
    }
  };
  
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'test_success':
        return { 
          icon: CheckCircle, 
          color: 'text-green-600', 
          bg: 'bg-green-100', 
          text: 'Connected',
          description: 'Connection tested successfully'
        };
      case 'testing':
        return { 
          icon: Clock, 
          color: 'text-blue-600', 
          bg: 'bg-blue-100', 
          text: 'Testing',
          description: 'Testing connection'
        };
      case 'test_failed':
        return { 
          icon: AlertCircle, 
          color: 'text-red-600', 
          bg: 'bg-red-100', 
          text: 'Failed',
          description: 'Connection test failed'
        };
      default:
        return { 
          icon: Clock, 
          color: 'text-gray-600', 
          bg: 'bg-gray-100', 
          text: 'Unknown',
          description: 'Status unknown'
        };
    }
  };

  const handleConnectionClick = (connectionId: string) => {
    console.log('Navigate to connection detail:', connectionId);
    navigate(`/connections/${connectionId}`);
  };

  const handleConnectionCreated = (connectionId: string, action?: 'chat' | 'details') => {
    console.log('Connection created:', connectionId, 'Action:', action);
    setShowSetupModal(false);
    loadConnections(); // Reload the connections list
    
    // Navigate based on user choice
    if (action === 'chat') {
      // Go to chat with this connection pre-selected
      navigate('/', { state: { selectedConnectionId: connectionId } });
    } else if (action === 'details') {
      // Go to connection details
      navigate(`/connections/${connectionId}`);
    }
    // If no action specified, stay on connections page (for "Create Another")
  };

  const handleActionClick = (action: string, connectionId: string) => {
    console.log('Action:', action, 'for connection:', connectionId);
    setShowActions(null);
    
    switch (action) {
      case 'view':
        handleConnectionClick(connectionId);
        break;
      case 'retrain':
        // TODO: Start retraining
        break;
      case 'delete':
        const connection = connections.find(conn => conn.id === connectionId);
        if (connection) {
          setDeletingConnection(connection);
        }
        break;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading connections...</p>
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
            {/* Left side with breadcrumb */}
            <div className="flex items-center gap-2">
              {/* Breadcrumb Navigation */}
              <nav className="flex items-center text-sm">
                <button
                  onClick={() => navigate('/')}
                  className="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                >
                  Chat
                </button>
                <span className="text-gray-400">/</span>
                <span className="text-gray-900 font-medium px-2">Connections</span>
              </nav>
            </div>
            
            {/* Right side with Add Connection button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSetupModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} />
                Add Connection
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {connections.length === 0 ? (
          // Empty State
          <div className="text-center py-12">
            <Database size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No connections yet</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Create your first database connection to start asking questions about your data with AI.
            </p>
            <button
              onClick={() => setShowSetupModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mx-auto"
            >
              <Plus size={20} />
              Create Your First Connection
            </button>
          </div>
        ) : (
          // Connections Grid
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connections.map(connection => {
              const statusInfo = getStatusInfo(connection.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div
                  key={connection.id}
                  className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={(e) => {
                    console.log('Card clicked for connection:', connection.id);
                    // Check if click is on the actions button
                    if ((e.target as HTMLElement).closest('button')) {
                      console.log('Click was on a button, not navigating');
                      return;
                    }
                    handleConnectionClick(connection.id);
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Database size={20} className="text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 truncate">{connection.name}</h3>
                        <p className="text-sm text-gray-500 truncate">{connection.server}</p>
                      </div>
                    </div>
                    
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowActions(showActions === connection.id ? null : connection.id);
                        }}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical size={16} className="text-gray-400" />
                      </button>
                      
                      {/* Actions Dropdown */}
                      {showActions === connection.id && (
                        <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                          {connection.status === 'test_success' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/connections/${connection.id}`);
                              }}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              View Details
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActionClick('delete', connection.id);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 last:rounded-b-lg"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${statusInfo.bg} ${statusInfo.color} mb-4`}>
                    <StatusIcon size={14} />
                    <span className="font-medium">{statusInfo.text}</span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-4">{statusInfo.description}</p>

                  {/* Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Database:</span>
                      <span className="text-gray-900">{connection.database_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Server:</span>
                      <span className="text-gray-900">{connection.server}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Created:</span>
                      <span className="text-gray-900">
                        {new Date(connection.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {connection.status === 'test_success' && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/connections/${connection.id}`);
                        }}
                        className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                        </svg>
                        View Details
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Click outside to close actions */}
      {showActions && (
        <div 
          className="fixed inset-0 z-5" 
          onClick={() => setShowActions(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingConnection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Delete Connection</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700">
                Are you sure you want to delete the connection <strong>"{deletingConnection.name}"</strong>?
              </p>
              <p className="text-sm text-gray-600 mt-2">
                This will permanently delete:
              </p>
              <ul className="text-sm text-gray-600 mt-1 ml-4 list-disc">
                <li>The database connection</li>
                <li>All schema information</li>
                <li>All column descriptions</li>
              </ul>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleDeleteConnection}
                disabled={deleteLoading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete
                  </>
                )}
              </button>
              <button
                onClick={() => setDeletingConnection(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Setup Modal */}
      <ConnectionSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onConnectionCreated={handleConnectionCreated}
      />
    </div>
  );
};