import React, { useRef, useEffect } from 'react';
import { Database, Play, Loader2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { PlotlyChart } from './PlotlyChart'; // Import the new component

interface ChatMessagesProps {
  messages: any[];
  loading: boolean;
  activeConversation: string | null;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({ 
  messages, 
  loading, 
  activeConversation 
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Empty state when no conversation selected or no messages
  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Database size={48} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Ready to explore your data
          </h2>
          <p className="text-gray-600 mb-6">
            Ask questions about your database in natural language. I'll generate SQL queries and show you the results.
          </p>
          
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {messages.map(msg => (
        <div key={msg.id} className={`flex gap-3 ${msg.type === 'user' ? 'justify-end' : ''}`}>
          {msg.type === 'assistant' && (
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
              AI
            </div>
          )}
          
          <div className={`max-w-3xl ${
            msg.type === 'user' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white border'
          } rounded-lg p-4`}>
            <div className="prose prose-sm max-w-none">
              <p>{msg.content}</p>
              
              {/* SQL Block */}
              {msg.sql && (
                <div className="mt-4 rounded-lg overflow-hidden animate-fadeIn">
                  <div className="flex items-center gap-2 text-gray-300 text-xs mb-2 px-3 py-2 bg-gray-800">
                    <Play size={12} />
                    Generated SQL
                  </div>
                  <SyntaxHighlighter
                    language="sql"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      borderRadius: 0,
                      fontSize: '14px'
                    }}
                  >
                    {msg.sql}
                  </SyntaxHighlighter>
                </div>
              )}
              
              {/* Data Table */}
              {msg.data && (
                <div className="mt-4 animate-fadeIn">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Results ({msg.data.length} rows):
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(msg.data[0]).map(key => (
                            <th key={key} className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {msg.data.map((row: any, idx: number) => (
                          <tr key={idx} className="border-b">
                            {Object.values(row).map((value: any, vidx: number) => (
                              <td key={vidx} className="px-4 py-2 text-sm">
                                {typeof value === 'number' && value > 100 
                                  ? value.toLocaleString() 
                                  : value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {msg.chart && (
                <div className="mt-4 animate-fadeIn">
                  <div className="bg-white border rounded-lg p-4">
                    <PlotlyChart chartData={msg.chart} />
                  </div>
                </div>
              )}
              
              {/* Summary */}
              {msg.summary && (
                <div className="mt-4 animate-fadeIn">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                        <span className="text-white text-xs font-bold">✨</span>
                      </div>
                      <div className="font-semibold text-blue-900">{msg.summary.title}</div>
                    </div>
                    <div className="space-y-2 mb-4">
                      {msg.summary.insights.map((insight: string, idx: number) => (
                        <div key={idx} className="text-sm text-blue-800 leading-relaxed animate-slideIn" style={{animationDelay: `${idx * 0.1}s`}}>
                          {insight}
                        </div>
                      ))}
                    </div>
                    <div className="bg-blue-100 rounded-lg p-3 animate-slideIn" style={{animationDelay: '0.4s'}}>
                      <div className="text-sm font-medium text-blue-900 mb-1">💡 Recommendation:</div>
                      <div className="text-sm text-blue-800">{msg.summary.recommendation}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {msg.type === 'user' && (
            <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
              U
            </div>
          )}
        </div>
      ))}
      
      {/* Loading indicator with step-by-step progress */}
      {loading && (
        <div className="flex gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
            AI
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-600">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
              <span>Processing...</span>
            </div>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};