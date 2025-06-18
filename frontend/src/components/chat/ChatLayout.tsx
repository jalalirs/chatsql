import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ChatSidebar } from './ChatSidebar';
import { ChatMain } from './ChatMain';

export const ChatLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleNewConversation = () => {
    console.log('🆕 Creating new conversation');
    setActiveConversation('new');
  };

  const handleConversationCreated = (conversationId: string) => {
    console.log('✅ Conversation created:', conversationId);
    // Switch to the new conversation
    setActiveConversation(conversationId);
    // Refresh the sidebar to show new conversation
    setRefreshTrigger(prev => prev + 1);
  };

  const handleConversationDeleted = (conversationId: string) => {
    console.log('🗑️ Conversation deleted:', conversationId);
    
    // If the deleted conversation was active, switch to new conversation
    if (activeConversation === conversationId) {
      setActiveConversation('new');
    }
    
    // Refresh the sidebar to remove deleted conversation
    setRefreshTrigger(prev => prev + 1);
  };

  const handleManageConnections = () => {
    navigate('/connections');
  };
  
  // ADD THIS: New handler for when a message is sent
  const handleMessageSent = () => {
    console.log('💬 Message sent, refreshing sidebar...');
    // Refresh sidebar to update message counts
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <ChatSidebar 
        isOpen={sidebarOpen}
        user={user}
        activeConversation={activeConversation}
        onConversationSelect={setActiveConversation}
        onNewConversation={handleNewConversation}
        onManageConnections={handleManageConnections}
        onLogout={logout}
        refreshTrigger={refreshTrigger}
        onConversationDeleted={handleConversationDeleted}
      />

      {/* Main Chat Area - ADD onMessageSent prop */}
      <ChatMain 
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        activeConversation={activeConversation}
        onNewConversation={handleNewConversation}
        onConversationCreated={handleConversationCreated}
        onManageConnections={handleManageConnections}
        onMessageSent={handleMessageSent}
      />
    </div>
  );
};