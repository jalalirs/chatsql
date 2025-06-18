import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, CheckCircle, AlertCircle, Clock, Zap, Play, Upload, Settings, FileText, RefreshCw } from 'lucide-react';
import { Connection } from '../types/chat';
import { chatService } from '../services/chat';
import { sseConnection } from '../services/sse';
import { trainingService } from '../services/training';
import { api } from '../services/auth';
import { DocumentationTab } from '../components/connection/DocumentationTab';
import { TrainingDataTab as TrainingDataTabComponent } from '../components/connection/TrainingDataTab';
import { TrainingTab as TrainingTabComponent } from '../components/connection/TrainingTab';



type TabType = 'details' | 'schema-descriptions' | 'documentation' | 'training-data' | 'training';

export const ConnectionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadConnection();
    } else {
      setError('No connection ID provided');
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const handleTabChange = (event: any) => {
      setActiveTab(event.detail as TabType);
    };

    document.addEventListener('changeTab', handleTabChange);
    
    return () => {
      document.removeEventListener('changeTab', handleTabChange);
    };
  }, []);

  const loadConnection = async () => {
    try {
      const response = await api.get(`/connections/${id}`);
      setConnection(response.data);
    } catch (err: any) {
      console.error('Failed to load connection:', err);
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
      case 'data_generated':
        return { icon: Play, color: 'text-blue-600', bg: 'bg-blue-100', text: 'Ready to Train' };
      case 'test_success':
        return { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100', text: 'Connected' };
      case 'generating_data':
        return { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100', text: 'Generating Data' };
      default:
        return { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-100', text: 'Unknown' };
    }
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: Database, description: 'Connection information and settings' },
    { id: 'schema-descriptions', label: 'Schema & Descriptions', icon: Settings, description: 'Table structure and column descriptions' },
    { id: 'documentation', label: 'Documentation', icon: FileText, description: 'General documentation and guides' },
    { id: 'training-data', label: 'Training Data', icon: Play, description: 'Question-SQL pairs and examples' },
    { id: 'training', label: 'Training', icon: Zap, description: 'Train and manage AI model' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading connection...</p>
        </div>
      </div>
    );
  }

  if (error || !connection) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Not Found</h2>
          <p className="text-gray-600 mb-4">{error || 'The requested connection could not be found.'}</p>
          <button
            onClick={() => navigate('/connections')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Connections
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(connection.status);
  const StatusIcon = statusInfo.icon;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'details':
        return <DetailsTab connection={connection} onConnectionUpdate={(updatedConnection) => setConnection(updatedConnection)} />;
      case 'schema-descriptions':
        return <SchemaDescriptionsTab connection={connection} onConnectionUpdate={(updatedConnection) => setConnection(updatedConnection)} />;
      case 'documentation':
        return <DocumentationTab connection={connection} onConnectionUpdate={(updatedConnection) => setConnection(updatedConnection)} />;
      case 'training-data':
        return <TrainingDataTabComponent connection={connection} onConnectionUpdate={(updatedConnection) => setConnection(updatedConnection)} />;
      case 'training':
        return <TrainingTabComponent connection={connection} onConnectionUpdate={(updatedConnection) => setConnection(updatedConnection)} />;
      default:
        return null;
    }
  };

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
                <button
                  onClick={() => navigate('/connections')}
                  className="text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                >
                  Connections
                </button>
                <span className="text-gray-400">/</span>
                <span className="text-gray-900 font-medium px-2">{connection.name}</span>
              </nav>
            </div>
            
            {/* Right side with actions and status */}
            <div className="flex items-center gap-3">
              {/* Use in Chat button if trained */}
              {connection.status === 'trained' && (
                <button
                  onClick={() => navigate('/', { state: { selectedConnectionId: connection.id } })}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg width={16} height={16} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                  </svg>
                  Use in Chat
                </button>
              )}
              
              {/* Status badge */}
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${statusInfo.bg} ${statusInfo.color}`}>
                <StatusIcon size={16} />
                <span className="font-medium">{statusInfo.text}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map(tab => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <TabIcon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderTabContent()}
      </div>
      
    </div>
  );
};

// Updated Details Tab Component with Test Connection
const DetailsTab: React.FC<{ connection: Connection; onConnectionUpdate: (connection: Connection) => void }> = ({ connection, onConnectionUpdate }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const response = await api.post(`/connections/${connection.id}/retest`);
      console.log('Retest response:', response.data);
  
      // Handle SSE stream for real-time updates
      if (response.data.stream_url) {
        const fullStreamUrl = response.data.stream_url.startsWith('http') 
          ? response.data.stream_url 
          : `http://localhost:6020${response.data.stream_url}`;
        
        console.log('Connecting to SSE:', fullStreamUrl);
        
        sseConnection.connect(fullStreamUrl, {
          onCompleted: (data) => {
            console.log('Test completed:', data);
            setTesting(false);
            if (data.success) {
              setTestResult('Connection test successful!');
              onConnectionUpdate({ ...connection, status: 'test_success' });
            } else {
              setTestResult(`Connection test failed: ${data.error || 'Unknown error'}`);
            }
          },
          
          onError: (data) => {
            console.log('Test error:', data);
            setTesting(false);
            setTestResult(`Connection test failed: ${data.error || data.message || 'Unknown error'}`);
          },
          
          onCustomEvent: (eventType, data) => {
            console.log('Custom event:', eventType, data);
            
            if (eventType === 'test_completed') {
              setTesting(false);
              if (data.success) {
                setTestResult('Connection test successful!');
                onConnectionUpdate({ ...connection, status: 'test_success' });
              } else {
                setTestResult(`Connection test failed: ${data.error || 'Unknown error'}`);
              }
            } else if (eventType === 'test_failed') {
              setTesting(false);
              setTestResult(`Connection test failed: ${data.error || 'Unknown error'}`);
            } else if (eventType === 'connected') {
              console.log('SSE connected successfully');
            }
          }
        }, 30000);
        
      } else {
        setTesting(false);
        setTestResult('No stream URL provided');
      }
      
    } catch (err: any) {
      console.error('Test connection error:', err);
      setTesting(false);
      setTestResult(`Connection test failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'trained':
        return { 
          color: 'text-green-600', 
          bg: 'bg-green-100', 
          text: 'Model is trained and ready for queries',
          icon: CheckCircle
        };
      case 'data_generated':
        return { 
          color: 'text-blue-600', 
          bg: 'bg-blue-100', 
          text: 'Training data generated',
          icon: Play
        };
      case 'test_success':
        return { 
          color: 'text-green-600', 
          bg: 'bg-green-100', 
          text: 'Connection successful and ready to use',
          icon: CheckCircle
        };
      case 'training':
        return { 
          color: 'text-purple-600', 
          bg: 'bg-purple-100', 
          text: 'Model training in progress',
          icon: Clock
        };
      case 'generating_data':
        return { 
          color: 'text-blue-600', 
          bg: 'bg-blue-100', 
          text: 'Generating training examples',
          icon: Clock
        };
      default:
        return { 
          color: 'text-gray-600', 
          bg: 'bg-gray-100', 
          text: 'Unknown status',
          icon: AlertCircle
        };
    }
  };

  const statusInfo = getStatusInfo(connection.status);
  const StatusIcon = statusInfo.icon;

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Connection Status</h2>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
        
        <div className={`flex items-center gap-3 p-4 rounded-lg ${statusInfo.bg} mb-4`}>
          <StatusIcon size={24} className={statusInfo.color} />
          <div>
            <div className={`font-medium ${statusInfo.color}`}>
              {connection.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <div className={`text-sm ${statusInfo.color.replace('600', '700')}`}>
              {statusInfo.text}
            </div>
          </div>
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg ${testResult.includes('successful') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult}
          </div>
        )}
      </div>

      {/* Connection Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Connection Information</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{connection.name}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Server</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{connection.server}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Database</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{connection.database_name}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{connection.table_name}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Driver</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900">{connection.driver}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
            <div className="p-3 bg-gray-50 rounded-lg text-gray-900">
              {new Date(connection.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Usage Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{connection.total_queries}</div>
            <div className="text-sm text-gray-500">Total Queries</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{connection.generated_examples_count}</div>
            <div className="text-sm text-gray-500">Training Examples</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {connection.column_descriptions_uploaded ? 'Yes' : 'No'}
            </div>
            <div className="text-sm text-gray-500">Column Descriptions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {connection.last_queried_at ? new Date(connection.last_queried_at).toLocaleDateString() : 'Never'}
            </div>
            <div className="text-sm text-gray-500">Last Queried</div>
          </div>
        </div>
      </div>

      {/* Training Timeline */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Training Timeline</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={16} className="text-green-600" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">Connection Created</div>
              <div className="text-sm text-gray-500">
                {new Date(connection.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              connection.generated_examples_count > 0 
                ? 'bg-green-100' 
                : 'bg-gray-100'
            }`}>
              {connection.generated_examples_count > 0 ? (
                <CheckCircle size={16} className="text-green-600" />
              ) : (
                <Clock size={16} className="text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <div className={`font-medium ${
                connection.generated_examples_count > 0 ? 'text-gray-900' : 'text-gray-500'
              }`}>
                Training Data Generated (Optional)
              </div>
              <div className="text-sm text-gray-500">
                {connection.generated_examples_count > 0 
                  ? `${connection.generated_examples_count} examples created`
                  : 'Can train with schema only'
                }
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              connection.status === 'trained' 
                ? 'bg-green-100' 
                : 'bg-gray-100'
            }`}>
              {connection.status === 'trained' ? (
                <CheckCircle size={16} className="text-green-600" />
              ) : (
                <Clock size={16} className="text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <div className={`font-medium ${
                connection.status === 'trained' ? 'text-gray-900' : 'text-gray-500'
              }`}>
                Model Training Completed
              </div>
              <div className="text-sm text-gray-500">
                {connection.trained_at 
                  ? new Date(connection.trained_at).toLocaleString()
                  : 'Ready to train'
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Placeholder components for other tabs (to be implemented)
// Schema & Descriptions Tab Component - Replace in ConnectionDetailPage.tsx

const SchemaDescriptionsTab: React.FC<{ connection: Connection; onConnectionUpdate: (connection: Connection) => void }> = ({ connection, onConnectionUpdate }) => {
  const [schemaData, setSchemaData] = useState<any>(null);
  const [columnDescriptions, setColumnDescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingDescriptions, setGeneratingDescriptions] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  useEffect(() => {
    loadSchemaAndDescriptions();
  }, [connection.id]);

  const loadSchemaAndDescriptions = async () => {
    try {
      setError(null);
      console.log('🔄 Loading schema and descriptions for connection:', connection.id);
      
      // Load schema and descriptions in parallel
      const [schemaResponse, descriptionsResponse] = await Promise.all([
        api.get(`/connections/${connection.id}/schema`).catch((err) => {
          console.log('⚠️ Schema load failed:', err);
          return null;
        }),
        api.get(`/connections/${connection.id}/column-descriptions`).catch((err) => {
          console.log('⚠️ Descriptions load failed:', err);
          return null;
        })
      ]);
      
      // Process schema data
      if (schemaResponse) {
        console.log('📊 Schema data loaded:', schemaResponse.data);
        setSchemaData(schemaResponse.data);
      } else {
        console.log('📊 No schema data available');
        setSchemaData(null);
      }
      
      // Process descriptions data
      if (descriptionsResponse) {
        console.log('📝 Full descriptions API response:', descriptionsResponse.data);
        console.log('📝 Column descriptions array:', descriptionsResponse.data.column_descriptions);
        
        const descriptions = descriptionsResponse.data.column_descriptions || [];
        console.log(`📝 Found ${descriptions.length} column descriptions`);
        
        // Log first few descriptions for debugging
        descriptions.slice(0, 3).forEach((desc: any, index: number) => {
          console.log(`📝 Description ${index + 1}:`, {
            column_name: desc.column_name,
            description: desc.description,
            has_description: desc.has_description,
            data_type: desc.data_type
          });
        });
        
        setColumnDescriptions(descriptions);
      } else {
        console.log('📝 No descriptions data available');
        setColumnDescriptions([]);
      }
      
    } catch (err: any) {
      console.error('❌ Failed to load schema and descriptions:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshSchema = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      const response = await api.post(`/connections/${connection.id}/refresh-schema`);
      console.log('Schema refresh started:', response.data);
      
      // Poll for completion (in production, use SSE)
      const pollForCompletion = async () => {
        let attempts = 0;
        const maxAttempts = 20;
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          try {
            const schemaResponse = await api.get(`/connections/${connection.id}/schema`);
            setSchemaData(schemaResponse.data);
            setRefreshing(false);
            return;
          } catch (e) {
            // Continue polling
          }
          
          attempts++;
        }
        
        throw new Error('Schema refresh timed out');
      };

      await pollForCompletion();
      
    } catch (err: any) {
      console.error('Schema refresh failed:', err);
      setError(err.message);
      setRefreshing(false);
    }
  };

  const generateAllDescriptions = async () => {
    setGeneratingDescriptions(true);
    setError(null);
    
    try {
      console.log('🤖 Starting AI description generation...');
      
      const response = await api.post(`/connections/${connection.id}/generate-column-descriptions`, {
        overwrite_existing: true
      });
      
      const result = response.data;
      console.log('📡 Generation task started:', result);
      
      // If there's a stream_url, use SSE for real-time updates
      if (result.stream_url) {
        const fullStreamUrl = result.stream_url.startsWith('http') 
          ? result.stream_url 
          : `http://localhost:6020${result.stream_url}`;
        
        console.log('🔗 Connecting to generation SSE stream:', fullStreamUrl);
        
        sseConnection.connect(fullStreamUrl, {
          onCustomEvent: (eventType, data) => {
            console.log('🎯 Generation event:', eventType, data);
            
            if (eventType === 'description_generated') {
              // Update individual column description in real-time
              setColumnDescriptions(prev => {
                const updated = [...prev];
                const existingIndex = updated.findIndex(col => col.column_name === data.column_name);
                
                if (existingIndex >= 0) {
                  updated[existingIndex] = {
                    ...updated[existingIndex],
                    description: data.description,
                    has_description: true
                  };
                } else {
                  updated.push({
                    column_name: data.column_name,
                    description: data.description,
                    data_type: data.data_type,
                    variable_range: data.variable_range,
                    has_description: true
                  });
                }
                
                return updated;
              });
            }
            if (eventType === 'generation_started') {
              console.log('🚀 Generation started:', data);
            } else if (eventType === 'generation_completed') {
              console.log('✅ Generation completed:', data);
              setGeneratingDescriptions(false);
              
              // Update connection status
              onConnectionUpdate({
                ...connection,
                column_descriptions_uploaded: true
              });
              
              // Reload descriptions immediately
              loadSchemaAndDescriptions();
            } else if (eventType === 'generation_failed' || eventType === 'generation_error') {
              console.error('❌ Generation failed:', data);
              setError(data.error || 'AI generation failed');
              setGeneratingDescriptions(false);
            }
          },
          
          onCompleted: (data) => {
            console.log('✅ Generation completed via onCompleted:', data);
            setGeneratingDescriptions(false);
            
            // Update connection status
            onConnectionUpdate({
              ...connection,
              column_descriptions_uploaded: true
            });
            
            // Reload descriptions
            loadSchemaAndDescriptions();
          },
          
          onError: (data) => {
            console.error('❌ Generation failed:', data);
            setError(data.error || 'AI generation failed');
            setGeneratingDescriptions(false);
          }
        }, 120000); // 2 minute timeout
        
      } else {
        // Fallback: Simple polling
        console.log('📊 No SSE stream, using polling...');
        
        const pollForCompletion = async () => {
          let attempts = 0;
          const maxAttempts = 30;
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
              console.log(`🔄 Polling attempt ${attempts + 1}/${maxAttempts}...`);
              const descriptionsResponse = await api.get(`/connections/${connection.id}/column-descriptions`);
              
              // Check if we have new descriptions (simple heuristic)
              const newDescriptions = descriptionsResponse.data.column_descriptions || [];
              interface ColumnDescription {
                column_name: string;
                description?: string;
                data_type?: string;
                has_description?: boolean;
              }

              // Then use it in the filter:
              const descriptionsCount = newDescriptions.filter((col: ColumnDescription) => col.description && col.description.trim().length > 0).length;
              
              console.log(`📝 Found ${descriptionsCount} columns with descriptions`);
              
              if (descriptionsCount > 0) {
                setColumnDescriptions(newDescriptions);
                setGeneratingDescriptions(false);
                
                // Update connection status
                onConnectionUpdate({
                  ...connection,
                  column_descriptions_uploaded: true
                });
                return;
              }
            } catch (e) {
              console.log('📊 Polling error (continuing):', e);
            }
            
            attempts++;
          }
          
          throw new Error('AI generation timed out - please check manually');
        };

        await pollForCompletion();
      }
      
    } catch (err: any) {
      console.error('❌ Failed to generate descriptions:', err);
      setError(err.response?.data?.detail || err.message);
      setGeneratingDescriptions(false);
    }
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/csv') {
      setError('Please upload a CSV file');
      return;
    }

    setCsvFile(file);
    setUploadingCsv(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.put(`/connections/${connection.id}/column-descriptions`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('CSV upload successful:', response.data);
      
      // Reload descriptions
      await loadSchemaAndDescriptions();
      
      // Update connection status
      onConnectionUpdate({
        ...connection,
        column_descriptions_uploaded: true
      });

    } catch (err: any) {
      console.error('CSV upload failed:', err);
      setError(err.response?.data?.detail || err.message);
    } finally {
      setUploadingCsv(false);
      setCsvFile(null);
      // Reset file input
      event.target.value = '';
    }
  };

  const updateDescription = async (columnName: string, description: string) => {
    try {
      // First, find the column ID from the existing data
      const column = columnDescriptions.find(col => col.column_name === columnName);
      
      if (column && column.id) {
        // Update existing column
        const response = await api.put(`/connections/${connection.id}/columns/${column.id}`, {
          description: description,
          description_source: "manual"
        });
      } else {
        // Create new column if it doesn't exist
        const response = await api.post(`/connections/${connection.id}/columns`, {
          column_name: columnName,
          data_type: schemaData?.schema?.columns[columnName]?.data_type || "",
          description: description,
          description_source: "manual"
        });
      }
  
      // Update local state
      setColumnDescriptions(prev => prev.map(col => 
        col.column_name === columnName 
          ? { ...col, description, has_description: description.length > 0 }
          : col
      ));
  
    } catch (err: any) {
      console.error('Failed to update description:', err);
      setError(err.response?.data?.detail || err.message);
    }
  };

  const downloadTemplate = () => {
    let csvContent = "column,description\n";
    
    if (columnDescriptions.length > 0) {
      columnDescriptions.forEach(col => {
        csvContent += `"${col.column_name}","${col.description || 'Add description here'}"\n`;
      });
    } else if (schemaData?.schema?.columns) {
      Object.keys(schemaData.schema.columns).forEach(columnName => {
        csvContent += `"${columnName}","Add description here"\n`;
      });
    } else {
      csvContent += "EmployeeID,Unique identifier for each employee\n";
      csvContent += "EmployeeName,Full name of the employee\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${connection.name}_column_descriptions_template.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const formatDataType = (dataType: string) => {
    return dataType.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
  };

  const renderColumnValue = (column: any) => {
    if (column.categories && column.categories.length > 0) {
      const displayCategories = column.categories.slice(0, 3);
      const hasMore = column.categories.length > 3;
      return (
        <div className="flex flex-wrap gap-1">
          {displayCategories.map((cat: string, idx: number) => (
            <span key={idx} className="px-1 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
              {cat}
            </span>
          ))}
          {hasMore && (
            <span className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
              +{column.categories.length - 3}
            </span>
          )}
        </div>
      );
    }
    
    if (column.range) {
      return (
        <div className="text-xs text-gray-600">
          {column.range.min} - {column.range.max}
        </div>
      );
    }
    
    if (column.date_range) {
      return (
        <div className="text-xs text-gray-600">
          {column.date_range.min} to {column.date_range.max}
        </div>
      );
    }
    
    return (
      <div className="text-xs text-gray-500">
        {column.variable_range || 'No data'}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            <span className="text-gray-600">Loading schema and descriptions...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Schema & Descriptions</h2>
            <p className="text-gray-600">
              Table structure and column descriptions for <strong>{connection.table_name}</strong>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Download CSV Template
            </button>
            
            <label className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer">
              Upload CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
                disabled={uploadingCsv}
              />
            </label>
            
            <button
              onClick={generateAllDescriptions}
              disabled={generatingDescriptions || !schemaData}
              className="px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {generatingDescriptions ? 'Generating...' : 'Generate All with AI'}
            </button>
            
            <button
              onClick={refreshSchema}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Settings size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh Schema'}
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

        {uploadingCsv && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-blue-800">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="font-medium">Uploading CSV...</span>
            </div>
          </div>
        )}

        {generatingDescriptions && (
          <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 text-purple-800">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
              <span className="font-medium">Generating descriptions with AI...</span>
            </div>
          </div>
        )}
      </div>

      {/* Schema Summary */}
      {schemaData && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Schema Overview</h3>
          
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">
                {schemaData.schema?.table_info?.total_columns || 0}
              </div>
              <div className="text-sm text-blue-700">Total Columns</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">
                {columnDescriptions.filter(col => col.has_description).length}
              </div>
              <div className="text-sm text-green-700">With Descriptions</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-600">
                {schemaData.schema?.table_info?.sample_rows || 0}
              </div>
              <div className="text-sm text-yellow-700">Sample Rows</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">
                {schemaData.last_refreshed ? new Date(schemaData.last_refreshed).toLocaleDateString() : 'Unknown'}
              </div>
              <div className="text-sm text-purple-700">Last Refreshed</div>
            </div>
          </div>
        </div>
      )}

      {/* Columns Table */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Columns & Descriptions</h3>
        
        {schemaData?.schema?.columns ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b w-1/5">
                    Column Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b w-1/6">
                    Data Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b w-1/4">
                    Values/Range
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b w-2/5">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(schemaData.schema.columns).map(([columnName, columnInfo]: [string, any]) => {
                  const description = columnDescriptions.find(col => col.column_name === columnName);
                  const isEditing = editingColumn === columnName;
                  
                  return (
                    <tr key={columnName} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {columnName}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-mono">
                          {formatDataType(columnInfo.data_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {renderColumnValue(columnInfo)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              defaultValue={description?.description || ''}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const value = (e.target as HTMLInputElement).value;
                                  updateDescription(columnName, value);
                                  setEditingColumn(null);
                                } else if (e.key === 'Escape') {
                                  setEditingColumn(null);
                                }
                              }}
                              onBlur={(e) => {
                                const value = e.target.value;
                                updateDescription(columnName, value);
                                setEditingColumn(null);
                              }}
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div 
                            className="cursor-pointer hover:bg-gray-100 p-1 rounded min-h-[20px]"
                            onClick={() => setEditingColumn(columnName)}
                          >
                            {description?.description ? (
                              <span className="text-gray-900">{description.description}</span>
                            ) : (
                              <span className="text-gray-400 italic">Click to add description...</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <Database size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Schema Data</h3>
            <p className="text-gray-600 mb-4">
              Click "Refresh Schema" to analyze your database structure.
            </p>
          </div>
        )}
      </div>

      {/* Sample Data */}
      {schemaData?.schema?.sample_data && schemaData.schema.sample_data.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Sample Data</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(schemaData.schema.sample_data[0]).map((header) => (
                    <th key={header} className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schemaData.schema.sample_data.map((row: any, index: number) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    {Object.values(row).map((value: any, cellIndex: number) => (
                      <td key={cellIndex} className="px-4 py-3 text-sm text-gray-700">
                        {value === null ? (
                          <span className="text-gray-400 italic">NULL</span>
                        ) : (
                          String(value)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};


