import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { chatService } from '../../services/chat';
import { Connection } from '../../types/chat';
import { useLocation } from 'react-router-dom';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:6020';

interface ChatMainProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeConversation: string | null;
  onNewConversation: () => void;
  onConversationCreated: (conversationId: string) => void;
  onManageConnections: () => void;
  onMessageSent?: () => void; // Add this line - make it optional with ?
}

export const ChatMain: React.FC<ChatMainProps> = ({
  sidebarOpen,
  onToggleSidebar,
  activeConversation,
  onNewConversation,
  onConversationCreated,
  onManageConnections,
  onMessageSent
}) => {
  const location = useLocation();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationData, setConversationData] = useState<any>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [justCreatedConversation, setJustCreatedConversation] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Handle pre-selected connection from navigation
  useEffect(() => {
    if (location.state?.selectedConnectionId && connections.length > 0) {
      const connection = connections.find(c => c.id === location.state.selectedConnectionId);
      if (connection && connection.status === 'trained') {
        setSelectedConnection(connection);
        // Clear the navigation state to prevent re-selection
        window.history.replaceState({}, document.title);
        
        // Optional: Show a toast or notification
        console.log(`✅ Connection "${connection.name}" selected and ready for chat!`);
      }
    }
  }, [location.state, connections]);

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, []);

  // Auto-select connection if only one trained connection exists
  useEffect(() => {
    const trainedConnections = connections.filter(conn => conn.status === 'trained');
    if (trainedConnections.length === 1 && !selectedConnection) {
      setSelectedConnection(trainedConnections[0]);
    } else if (trainedConnections.length === 0) {
      setSelectedConnection(null);
    }
  }, [connections, selectedConnection]);

  // Load conversation messages when activeConversation changes
  useEffect(() => {
    console.log('🔄 useEffect triggered - activeConversation:', activeConversation, 'justCreatedConversation:', justCreatedConversation);
    
    if (activeConversation && activeConversation !== 'new') {
      // Only skip loading if this is the EXACT conversation we just created AND it has messages
      const shouldSkipLoad = justCreatedConversation === activeConversation && messages.length > 0;
      
      if (shouldSkipLoad) {
        console.log('✅ Skipping reload for just-created conversation with existing messages');
        setJustCreatedConversation(null); // Reset the flag
        return;
      }
      
      console.log('📥 Loading conversation messages for:', activeConversation);
      loadConversationMessages();
    } else if (activeConversation === 'new') {
      console.log('🆕 New conversation state - clearing messages');
      setMessages([]);
      setConversationData(null);
      setSelectedConnection(null); // Reset connection selection for new conversation
    }
  }, [activeConversation]);
  
  const loadConnections = async () => {
    try {
      console.log('Loading connections...');
      const connectionsData: any = await chatService.getConnections();
      console.log('Connections data:', connectionsData);
      
      // Handle the backend response format: {connections: [...], total: number}
      let connections: Connection[] = [];
      if (connectionsData && Array.isArray(connectionsData.connections)) {
        connections = connectionsData.connections;
      } else if (Array.isArray(connectionsData)) {
        connections = connectionsData;
      } else {
        console.error('Unexpected connections data format:', connectionsData);
        connections = [];
      }
      
      setConnections(connections);
    } catch (error) {
      console.error('Failed to load connections:', error);
      setConnections([]);
    }
  };

  const loadConversationMessages = async () => {
    if (!activeConversation || activeConversation === 'new') return;
  
    setLoadingMessages(true);
    
    try {
      console.log('🔍 Loading conversation:', activeConversation);
      // This call is safe here because activeConversation is guaranteed to be a string
      const conversationWithMessages = await chatService.getConversationWithMessages(activeConversation);
      console.log('📨 Loaded conversation data:', conversationWithMessages);
      
      setConversationData(conversationWithMessages);
      
      // ✅ FIX: Transform messages to match expected format
      const transformedMessages = conversationWithMessages.messages?.map((msg: any) => ({
        id: msg.id,
        type: msg.message_type,
        content: msg.content,
        sql: msg.generated_sql,
        data: msg.query_results?.data,  // ✅ Use nested data
        chart: msg.chart_data,
        summary: msg.summary ? {  // ✅ Use separate summary field
          title: "Query Results Summary",
          insights: [msg.summary],
          recommendation: "Continue exploring your data with follow-up questions."
        } : null,
        timestamp: new Date(msg.created_at)
      })) || [];
      
      console.log('✨ Transformed messages:', transformedMessages);
      setMessages(transformedMessages);
      
      // Set the conversation's connection as selected
      if (conversationWithMessages.connection_id) {
        const connection = connections.find(c => c.id === conversationWithMessages.connection_id);
        if (connection) {
          console.log('🔗 Setting selected connection:', connection.name);
          setSelectedConnection(connection);
        } else {
          console.warn('⚠️ Connection not found for ID:', conversationWithMessages.connection_id);
        }
      }
      
      // Clear the just created flag since we're loading a different conversation
      setJustCreatedConversation(null);
      
    } catch (error) {
      console.error('❌ Failed to load conversation messages:', error);
      setMessages([]);
      setConversationData(null);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleConnectionSelect = (connection: Connection) => {
    console.log('🔗 Connection selected:', connection.name);
    setSelectedConnection(connection);
  };

  const handleSendMessage = async (message: string) => {
    console.log('💬 handleSendMessage called with:', { message, loading, selectedConnection, activeConversation });
    
    if (!message.trim() || loading || !selectedConnection) {
      console.log('❌ Aborting send - conditions not met');
      return;
    }

    console.log('✅ Proceeding with message send...');

    // For new conversations, create conversation first
    let conversationId = activeConversation;
    let isNewConversation = false;

    if (!conversationId || conversationId === 'new') {
      try {
        console.log('🆕 Creating new conversation...');
        const newConversation = await chatService.createConversation(
          selectedConnection.id,
          message.length > 50 ? message.substring(0, 50) + '...' : message
        );
        conversationId = newConversation.id;
        isNewConversation = true;
        console.log('✅ New conversation created:', conversationId);
        
        // Update conversation data
        setConversationData(newConversation);
        setJustCreatedConversation(conversationId);
        onConversationCreated(conversationId);
      } catch (error) {
        console.error('❌ Failed to create conversation:', error);
        return;
      }
    }

    // Add user message immediately
    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: message,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Send query to backend
      const response = await chatService.sendQuery(message, conversationId);
      console.log('📤 Query response:', response);
      
      const aiMessageId = Date.now() + 1;
      
      // Connect to SSE stream from backend
      if (response.session_id && response.stream_url) {
        try {
          console.log('🔌 Setting up EventSource connection...');
          const fullStreamUrl = response.stream_url.startsWith('http') 
            ? response.stream_url 
            : `${API_BASE_URL}${response.stream_url}`;
          
          console.log('🌐 EventSource URL:', fullStreamUrl);
          
          const eventSource = new EventSource(fullStreamUrl);
          console.log('📡 EventSource created, readyState:', eventSource.readyState);
          
          let connected = false;
          
          eventSource.onopen = () => {
            console.log('✅ EventSource opened successfully');
            connected = true;
          };
          
          eventSource.onmessage = (event) => {
            console.log('📨 EventSource message:', event);
            try {
              const data = JSON.parse(event.data);
              console.log('📨 Parsed data:', data);
              
              // Handle generic data updates (fallback)
              if (data.message) {
                setMessages(prev => prev.map(msg => 
                  msg.id === aiMessageId 
                    ? { ...msg, content: data.message }
                    : msg
                ));
              }
            } catch (e) {
              console.error('Error parsing message:', e);
            }
          };
          
          eventSource.addEventListener('connected', (event) => {
            console.log('🔗 Connected event:', event.data);
          });

          eventSource.addEventListener('conversation_info', (event) => {
            console.log('💬 Conversation info event:', event.data);
            try {
              const data = JSON.parse(event.data);
              // Handle conversation details from backend
              if (data.is_new_conversation && !isNewConversation) {
                isNewConversation = true;
                setJustCreatedConversation(data.conversation_id);
                onConversationCreated(data.conversation_id);
              }
            } catch (e) {
              console.error('Error in conversation_info:', e);
            }
          });
          
          eventSource.addEventListener('query_started', (event) => {
            console.log('🚀 Query started event:', event.data);
            try {
              const data = JSON.parse(event.data);
              
              // Add AI message when query starts
              setMessages(prev => {
                const hasAiMessage = prev.some(msg => msg.id === aiMessageId);
                if (!hasAiMessage) {
                  return [...prev, {
                    id: aiMessageId,
                    type: 'assistant',
                    content: "I'll help you with that query. Let me generate the SQL and fetch the results.",
                    timestamp: new Date()
                  }];
                }
                return prev;
              });
            } catch (e) {
              console.error('Error in query_started:', e);
            }
          });
          
          eventSource.addEventListener('sql_generated', (event) => {
            console.log('📝 SQL generated event:', event.data);
            try {
              const data = JSON.parse(event.data);
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg, 
                      sql: data.sql
                    }
                  : msg
              ));
            } catch (e) {
              console.error('Error in sql_generated:', e);
            }
          });
          
          eventSource.addEventListener('data_fetched', (event) => {
            console.log('📊 Data fetched event:', event.data);
            try {
              const data = JSON.parse(event.data);
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg,
                      data: data.data // Use data.data from the backend response
                    }
                  : msg
              ));
            } catch (e) {
              console.error('Error in data_fetched:', e);
            }
          });
          
          eventSource.addEventListener('chart_generated', (event) => { // Keep this one
            console.log('📈 Chart generated event:', event.data);
            try {
              const data = JSON.parse(event.data);
              console.log('📊 Chart data structure:', {
                hasChartData: !!data.chart_data,
                chartDataKeys: data.chart_data ? Object.keys(data.chart_data) : [],
                dataLength: data.chart_data?.data?.length,
                layoutTitle: data.chart_data?.layout?.title
              });
              
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg,
                      chart: data.chart_data  // Make sure this is chart_data not chart
                    }
                  : msg
              ));
            } catch (e) {
              console.error('Error in chart_generated:', e);
            }
          });
          
          eventSource.addEventListener('summary_generated', (event) => {
            console.log('📋 Summary generated event:', event.data);
            try {
              const data = JSON.parse(event.data);
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg,
                      summary: {
                        title: "Query Results Summary",
                        insights: [data.summary],
                        recommendation: "Continue exploring your data with follow-up questions."
                      }
                    }
                  : msg
              ));
            } catch (e) {
              console.error('Error in summary_generated:', e);
            }
          });
          
          eventSource.addEventListener('query_completed', (event) => {
            console.log('✅ Query completed event:', event.data);
            try {
              const data = JSON.parse(event.data);
              
              // Make sure the final message has all data if missing
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { 
                      ...msg,
                      // Update content if it's still generic
                      content: msg.summary?.insights?.[0] || 
                              data.summary || 
                              `Query executed successfully. Found ${data.has_data ? 'results' : 'no data'}.`,
                      // Ensure summary exists
                      summary: msg.summary || {
                        title: "Query Results",
                        insights: [
                          data.summary || `Query executed on ${selectedConnection.name}`,
                          `Found ${data.has_data ? 'data' : 'no data'}`,
                          `${data.has_chart ? 'Chart generated' : 'No chart needed'}`
                        ],
                        recommendation: "Ask follow-up questions to explore your data further."
                      }
                    }
                  : msg
              ));
              
              setLoading(false);
              eventSource.close();
            } catch (e) {
              console.error('Error in query_completed:', e);
              setLoading(false);
              eventSource.close();
            }
          });

          eventSource.addEventListener('query_error', (event) => {
            console.log('❌ Query error event:', event.data);
            try {
              const data = JSON.parse(event.data);
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { ...msg, content: `Error: ${data.error}` }
                  : msg
              ));
              setLoading(false);
              eventSource.close();
            } catch (e) {
              console.error('Error in query_error:', e);
            }
          });
          
          eventSource.onerror = (error) => {
            console.error('❌ EventSource error:', error);
            console.error('EventSource readyState:', eventSource.readyState);
            
            if (!connected) {
              setLoading(false);
              setMessages(prev => prev.map(msg => 
                msg.id === aiMessageId 
                  ? { ...msg, content: "Connection failed. Please try again." }
                  : msg
              ));
            }
            eventSource.close();
          };
          
          // Timeout after 30 seconds
          setTimeout(() => {
            if (eventSource.readyState !== EventSource.CLOSED) {
              console.log('⏰ EventSource timeout');
              eventSource.close();
              setLoading(false);
            }
          }, 30000);
          
        } catch (error) {
          console.error('❌ EventSource setup error:', error);
          setLoading(false);
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: "Failed to set up connection. Please try again." }
              : msg
          ));
        }
      } else {
        // Fallback if no SSE stream provided
        setMessages(prev => [...prev, {
          id: aiMessageId,
          type: 'assistant',
          content: "Response received but no stream available.",
          timestamp: new Date()
        }]);
        setLoading(false);
      }
      
    } catch (error) {
      console.error('Failed to send message:', error);
      setLoading(false);
      
      // Add error message
      const errorMessage = {
        id: Date.now() + 1,
        type: 'assistant',
        content: "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Get conversation title
  const getConversationTitle = () => {
    if (!activeConversation || activeConversation === 'new') {
      return selectedConnection ? `Chat with ${selectedConnection.name}` : 'New Conversation';
    }
    return conversationData?.title || 'Loading...';
  };

  // Check if chat should be disabled
  const trainedConnections = connections.filter(conn => conn.status === 'trained');
  const isChatDisabled = trainedConnections.length === 0;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg lg:hidden"
        >
          <Menu size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900">
            {getConversationTitle()}
          </h2>
          <p className="text-sm text-gray-500">
            {selectedConnection 
              ? `Connected to ${selectedConnection.name} • Ask anything about your data`
              : isChatDisabled 
                ? 'Set up a database connection to start chatting'
                : 'Select a connection to start asking questions'
            }
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading conversation...</div>
          </div>
        ) : (
          <ChatMessages 
            messages={messages} 
            loading={loading}
            activeConversation={activeConversation}
          />
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSendMessage}
          loading={loading}
          connections={connections}
          selectedConnection={selectedConnection}
          onConnectionSelect={handleConnectionSelect}
        />
      </div>
    </div>
  );
};