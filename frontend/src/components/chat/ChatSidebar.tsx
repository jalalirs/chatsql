import React, { useState, useEffect } from 'react';
import { Plus, Settings, User, History, Database, Trash2, MoreVertical } from 'lucide-react';
import { User as UserType } from '../../types/auth';
import { Conversation } from '../../types/chat';
import { chatService } from '../../services/chat';

interface ChatSidebarProps {
  isOpen: boolean;
  user: UserType | null;
  activeConversation: string | null;
  onConversationSelect: (id: string) => void;
  onNewConversation: () => void;
  onManageConnections: () => void;
  onLogout: () => void;
  refreshTrigger?: number;
  onConversationDeleted?: (conversationId: string) => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  isOpen,
  user,
  activeConversation,
  onConversationSelect,
  onNewConversation,
  onManageConnections,
  onLogout,
  refreshTrigger = 0,
  onConversationDeleted
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingConversations, setDeletingConversations] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, [refreshTrigger]);

  const loadConversations = async () => {
    try {
      console.log('Loading sidebar conversations...');
      const conversationsData = await chatService.getConversations();
      console.log('Loaded conversations:', conversationsData);
      setConversations(conversationsData);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (conversationId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent conversation selection
    
    // Show confirmation dialog
    setShowDeleteConfirm(conversationId);
  };

  const confirmDeleteConversation = async (conversationId: string) => {
    try {
      setDeletingConversations(prev => new Set(prev).add(conversationId));
      
      console.log('Deleting conversation:', conversationId);
      await chatService.deleteConversation(conversationId);
      
      // Remove from local state
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      
      // If this was the active conversation, clear it
      if (activeConversation === conversationId) {
        onConversationDeleted?.(conversationId);
      }
      
      console.log('Conversation deleted successfully');
      
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      // You might want to show a toast notification here
    } finally {
      setDeletingConversations(prev => {
        const newSet = new Set(prev);
        newSet.delete(conversationId);
        return newSet;
      });
      setShowDeleteConfirm(null);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`${isOpen ? 'w-64' : 'w-0'} transition-all duration-300 bg-gray-900 text-white flex flex-col overflow-hidden relative`}>
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Conversation</h3>
            <p className="text-gray-300 text-sm mb-4">
              Are you sure you want to delete this conversation? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteConversation(showDeleteConfirm)}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded transition-colors"
                disabled={deletingConversations.has(showDeleteConfirm)}
              >
                {deletingConversations.has(showDeleteConfirm) ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Tex2SQL</h1>
          <button
            onClick={onNewConversation}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            title="New Conversation"
          >
            <Plus size={16} />
          </button>
        </div>
        
        {/* Quick Actions */}
        <div className="space-y-2">
          <button
            onClick={onManageConnections}
            className="w-full flex items-center gap-3 p-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Database size={16} />
            <span>Manage Connections</span>
          </button>
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="text-sm text-gray-300 mb-3 flex items-center gap-2">
            <History size={14} />
            Recent Conversations
          </div>
          {loading ? (
            <div className="text-center text-gray-400 text-sm">Loading...</div>
          ) : conversations.length > 0 ? (
            <div className="space-y-2">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
                    activeConversation === conv.id 
                      ? 'bg-gray-700' 
                      : 'hover:bg-gray-800'
                  } ${deletingConversations.has(conv.id) ? 'opacity-50' : ''}`}
                >
                  <div
                    onClick={() => !deletingConversations.has(conv.id) && onConversationSelect(conv.id)}
                    className="flex-1"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium truncate pr-2">{conv.title}</div>
                      <div className="flex items-center gap-1">
                        {conv.is_pinned && (
                          <div className="text-yellow-400 text-xs">📌</div>
                        )}
                        
                        {/* Delete Button */}
                        <button
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded transition-all duration-200"
                          title="Delete conversation"
                          disabled={deletingConversations.has(conv.id)}
                        >
                          {deletingConversations.has(conv.id) ? (
                            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Trash2 size={12} className="text-gray-400 hover:text-red-400" />
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {/* Only show latest message if available */}
                    {conv.latest_message && (
                      <div className="text-xs text-gray-400 truncate mt-1">
                        {conv.latest_message}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs text-gray-500">
                        {formatTimeAgo(conv.last_message_at || conv.created_at)}
                      </div>
                      <div className="text-xs text-gray-500 truncate ml-2">
                        {conv.connection_name}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm">
              No conversations yet
            </div>
          )}
        </div>
      </div>

      {/* User Menu */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded-lg cursor-pointer group">
          <User size={16} />
          <div className="flex-1">
            <div className="text-sm font-medium">{user?.full_name || user?.username}</div>
            <div className="text-xs text-gray-400">{user?.email}</div>
          </div>
          <button
            onClick={onLogout}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            title="Logout"
          >
            <Settings size={16} className="text-gray-400 hover:text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
};