import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, CheckCircle, AlertCircle, Clock, Zap, Play, Upload, Settings, FileText, RefreshCw, Brain, Terminal } from 'lucide-react';
import { Connection } from '../types/chat';
import { chatService } from '../services/chat';
import { sseConnection } from '../services/sse';
import { trainingService } from '../services/training';
import { api } from '../services/auth';


const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:6020';

type TabType = 'details' | 'schema-descriptions' | 'sql-query';

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
      case 'test_success':
        return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', text: 'Connected' };
      case 'test_failed':
        return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100', text: 'Failed' };
      case 'connecting':
        return { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100', text: 'Testing' };
      default:
        return { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-100', text: 'Unknown' };
    }
  };

  const tabs = [
    { id: 'details', label: 'Details', icon: Database, description: 'Connection information and settings' },
    { id: 'schema-descriptions', label: 'Schema & Descriptions', icon: Settings, description: 'Table structure and column descriptions' },
    { id: 'sql-query', label: 'SQL Query', icon: Terminal, description: 'Execute SQL queries directly on the database' }
  ];
  
  console.log('Tabs array:', tabs);

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
      case 'sql-query':
        return <SqlQueryTab connection={connection} />;
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
              {/* Create Model button */}
              <button
                onClick={() => navigate('/models', { state: { createFromConnection: connection.id } })}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Brain size={16} />
                Create Model
              </button>
              
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
          : `${API_BASE_URL}${response.data.stream_url}`;
        
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
        <h2 className="text-lg font-medium text-gray-900 mb-4">Connection Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{connection.database_name}</div>
            <div className="text-sm text-gray-500">Database</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{connection.driver}</div>
            <div className="text-sm text-gray-500">Driver</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{connection.server}</div>
            <div className="text-sm text-gray-500">Server</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {new Date(connection.created_at).toLocaleDateString()}
            </div>
            <div className="text-sm text-gray-500">Created</div>
          </div>
        </div>
      </div>

      {/* Connection Timeline */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Connection Timeline</h2>
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
              connection.status === 'test_success' 
                ? 'bg-green-100' 
                : 'bg-gray-100'
            }`}>
              {connection.status === 'test_success' ? (
                <CheckCircle size={16} className="text-green-600" />
              ) : (
                <Clock size={16} className="text-gray-400" />
              )}
            </div>
            <div className="flex-1">
              <div className={`font-medium ${
                connection.status === 'test_success' ? 'text-gray-900' : 'text-gray-500'
              }`}>
                Connection Tested
              </div>
              <div className="text-sm text-gray-500">
                {connection.status === 'test_success' 
                  ? 'Connection is working properly'
                  : 'Ready to test connection'
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
        status: 'test_success'
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
        // Find the column in the first table for now
        const firstTableName = Object.keys(schemaData.schema)[0];
        const firstTable = schemaData.schema[firstTableName];
        const columnInfo = firstTable?.columns?.find((col: any) => col.column_name === columnName);
        
        const response = await api.post(`/connections/${connection.id}/columns`, {
          column_name: columnName,
          data_type: columnInfo?.data_type || "",
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
    } else if (schemaData?.schema && Object.keys(schemaData.schema).length > 0) {
      // Get columns from the first table
      const firstTableName = Object.keys(schemaData.schema)[0];
      const firstTable = schemaData.schema[firstTableName];
      firstTable?.columns?.forEach((column: any) => {
        csvContent += `"${column.column_name}","Add description here"\n`;
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
              Table structure and column descriptions for <strong>{connection.database_name}</strong>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Download CSV Template
            </button>
            
            <label className="cursor-pointer px-3 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
                disabled={uploadingCsv}
              />
              {uploadingCsv ? 'Uploading...' : 'Upload CSV'}
            </label>
            
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


      </div>

      {/* Schema Summary */}
      {schemaData && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Schema Overview</h3>
          
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">
                {schemaData.total_columns || 0}
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
                {schemaData.total_tables || 0}
              </div>
              <div className="text-sm text-yellow-700">Total Tables</div>
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

      {/* Tables List */}
      {schemaData?.schema && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Database Tables</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(schemaData.schema).map(([tableName, tableInfo]: [string, any]) => (
              <div key={tableName} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <h4 className="font-medium text-gray-900 mb-2">{tableName}</h4>
                <div className="text-sm text-gray-600">
                  <div>Schema: {tableInfo.schema_name}</div>
                  <div>Type: {tableInfo.table_type}</div>
                  <div>Columns: {tableInfo.columns?.length || 0}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Columns Table - Show first table's columns for now */}
      {schemaData?.schema && Object.keys(schemaData.schema).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Columns & Descriptions - {Object.keys(schemaData.schema)[0]}
          </h3>
          
          {(() => {
            const firstTableName = Object.keys(schemaData.schema)[0];
            const firstTable = schemaData.schema[firstTableName];
            const columns = firstTable?.columns || [];
            
            return columns.length > 0 ? (
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
                        Nullable
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b w-2/5">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((columnInfo: any) => {
                      const columnName = columnInfo.column_name;
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
                            <span className={`px-2 py-1 text-xs rounded ${
                              columnInfo.is_nullable 
                                ? 'bg-yellow-100 text-yellow-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {columnInfo.is_nullable ? 'Nullable' : 'Not Null'}
                            </span>
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
                                    const value = (e.target as HTMLInputElement).value;
                                    updateDescription(columnName, value);
                                    setEditingColumn(null);
                                  }}
                                  autoFocus
                                />
                                <button
                                  onClick={() => setEditingColumn(null)}
                                  className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">
                                  {description?.description || 'No description'}
                                </span>
                                <button
                                  onClick={() => setEditingColumn(columnName)}
                                  className="ml-2 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                >
                                  Edit
                                </button>
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
              <div className="text-center py-8 text-gray-500">
                No columns found for this table.
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

// SQL Query Tab Component
const SqlQueryTab: React.FC<{ connection: Connection }> = ({ connection }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  const executeQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a SQL query');
      return;
    }

    setExecuting(true);
    setError(null);
    setResults([]);
    setColumns([]);
    setExecutionTime(null);

    const startTime = Date.now();

    try {
      const response = await api.post(`/connections/${connection.id}/execute-query`, {
        query: query.trim()
      });

      const endTime = Date.now();
      setExecutionTime(endTime - startTime);

      if (response.data.success) {
        setResults(response.data.results || []);
        setColumns(response.data.columns || []);
        
        // Add to query history if not already present
        if (!queryHistory.includes(query.trim())) {
          setQueryHistory(prev => [query.trim(), ...prev.slice(0, 9)]); // Keep last 10 queries
        }
      } else {
        setError(response.data.error || 'Query execution failed');
      }
    } catch (err: any) {
      const endTime = Date.now();
      setExecutionTime(endTime - startTime);
      setError(err.response?.data?.detail || err.message || 'Query execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      executeQuery();
    }
  };

  const loadQueryFromHistory = (historyQuery: string) => {
    setQuery(historyQuery);
    setError(null);
  };

  const clearQuery = () => {
    setQuery('');
    setResults([]);
    setColumns([]);
    setError(null);
    setExecutionTime(null);
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">NULL</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="text-blue-600">{value.toString()}</span>;
    }
    if (typeof value === 'number') {
      return <span className="text-green-600">{value.toLocaleString()}</span>;
    }
    if (typeof value === 'string') {
      return <span className="text-gray-900">{value}</span>;
    }
    return <span className="text-gray-900">{JSON.stringify(value)}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Query Input */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">SQL Query Editor</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={clearQuery}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={executeQuery}
              disabled={executing || !query.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Play size={16} className={executing ? 'animate-pulse' : ''} />
              {executing ? 'Executing...' : 'Execute Query'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SQL Query
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your SQL query here... (Ctrl+Enter to execute)"
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              disabled={executing}
            />
          </div>

          <div className="text-xs text-gray-500">
            💡 Tip: Use Ctrl+Enter (or Cmd+Enter on Mac) to execute the query quickly
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle size={16} />
              <span className="font-medium">Query Error</span>
            </div>
            <p className="text-red-700 text-sm mt-1 font-mono">{error}</p>
          </div>
        )}

        {executionTime !== null && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle size={16} />
              <span className="font-medium">Query executed successfully</span>
              <span className="text-sm">({executionTime}ms)</span>
            </div>
          </div>
        )}
      </div>

      {/* Query History */}
      {queryHistory.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Queries</h3>
          <div className="space-y-2">
            {queryHistory.map((historyQuery, index) => (
              <button
                key={index}
                onClick={() => loadQueryFromHistory(historyQuery)}
                className="w-full text-left p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <div className="font-mono text-sm text-gray-700 truncate">
                  {historyQuery}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Query Results ({results.length} rows)
            </h3>
            {executionTime !== null && (
              <span className="text-sm text-gray-500">
                Executed in {executionTime}ms
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map((column, index) => (
                    <th
                      key={index}
                      className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b hover:bg-gray-50">
                    {columns.map((column, colIndex) => (
                      <td key={colIndex} className="px-4 py-3 text-sm">
                        {formatValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Results */}
      {results.length === 0 && !executing && !error && query.trim() && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-center py-8">
            <Database size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results</h3>
            <p className="text-gray-500">
              Your query executed successfully but returned no rows.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};


