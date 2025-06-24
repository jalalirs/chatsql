import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import { trainingService } from '../../services/training';
import { sseConnection } from '../../services/sse';
import { Connection } from '../../types/chat';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:6020';

interface TrainingTabProps {
  connection: Connection;
  onConnectionUpdate: (connection: Connection) => void;
}

const TrainingTab: React.FC<TrainingTabProps> = ({ connection, onConnectionUpdate }) => {
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingPhase, setTrainingPhase] = useState<string>('');

  const handleStartTraining = async () => {
    setTraining(true);
    setError(null);
    setTrainingProgress(0);
    setTrainingPhase('');
    
    try {
      console.log('🚀 Starting model training for connection:', connection.id);
      
      // Call the backend training endpoint
      const result = await trainingService.trainModel(connection.id);
      console.log('📡 Training task started:', result);

      // Connect to SSE stream for real-time updates
      if (result.stream_url) {
        const fullStreamUrl = result.stream_url.startsWith('http') 
          ? result.stream_url 
          : `http://${API_BASE_URL}$:6020${result.stream_url}`;
        
        console.log('🔗 Connecting to training SSE stream:', fullStreamUrl);
        
        // Use the sseConnection instead of sseService
        sseConnection.connect(fullStreamUrl, {
          onProgress: (data: any) => {
            console.log('📊 Training progress:', data);
            if (data.progress !== undefined) {
              setTrainingProgress(data.progress);
            }
            if (data.message) {
              setTrainingPhase(data.message);
            }
          },
          
          onCustomEvent: (eventType: any, data: any) => {
            console.log('🎯 Training event:', eventType, data);
            
            if (eventType === 'training_started') {
              console.log('🚀 Training started:', data);
              setTrainingPhase('Training started...');
            } else if (eventType === 'training_completed') {
              console.log('✅ Training completed via custom event:', data);
              setTraining(false);
              setTrainingProgress(100);
              setTrainingPhase('Training completed successfully!');
              
              // Update connection status in the UI
              onConnectionUpdate({
                ...connection,
                status: 'trained',
                trained_at: new Date().toISOString()
              });
              
              // Clear progress after a moment
              setTimeout(() => {
                setTrainingProgress(0);
                setTrainingPhase('');
              }, 3000);
            } else if (eventType === 'training_error') {
              console.error('❌ Training error event:', data);
              const errorMessage = data.error || data.message || 'Training failed';
              setError(errorMessage);
              setTraining(false);
              setTrainingProgress(0);
              setTrainingPhase('');
            } else if (eventType === 'info' || eventType === 'log') {
              console.log('ℹ️ Training info:', data);
              if (data.message) {
                setTrainingPhase(data.message);
              }
            }
          },
          
          onCompleted: async (data: any) => {
            console.log('✅ Training completed via onCompleted:', data);
            setTraining(false);
            setTrainingProgress(100);
            setTrainingPhase('Training completed successfully!');
            
            // Update connection status in the UI
            onConnectionUpdate({
              ...connection,
              status: 'trained',
              trained_at: new Date().toISOString()
            });
            
            // Clear progress after a moment
            setTimeout(() => {
              setTrainingProgress(0);
              setTrainingPhase('');
            }, 3000);
          },
          
          onError: (data: any) => {
            console.error('❌ Training failed:', data);
            const errorMessage = data.error || data.message || 'Training failed';
            console.error('Error details:', errorMessage);
            setError(errorMessage);
            setTraining(false);
            setTrainingProgress(0);
            setTrainingPhase('');
          }
        }, 600000); // 10 minute timeout for training
      } else {
        throw new Error('No stream URL provided by backend');
      }
      
    } catch (err: any) {
      console.error('Failed to start training:', err);
      setError(err.response?.data?.detail || err.message);
      setTraining(false);
      setTrainingProgress(0);
      setTrainingPhase('');
    }
  };

  // Can train with test_success status (no data generation required)
  const canTrain = ['test_success', 'data_generated'].includes(connection.status) || connection.status === 'trained';

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Model Training</h2>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle size={16} />
              <span className="font-medium">Training Error</span>
            </div>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        )}

        {connection.status === 'trained' ? (
          <div className="text-center py-8">
            <CheckCircle size={48} className="mx-auto text-green-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Model Trained Successfully!</h3>
            <p className="text-gray-600 mb-6">
              Your AI model is ready to answer questions about your data. 
              You can now use it in the chat interface.
            </p>
            
            {/* Training Stats */}
            <div className="grid grid-cols-2 gap-4 mb-6 max-w-md mx-auto">
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-lg font-bold text-green-600">
                  {connection.generated_examples_count || 'Schema Only'}
                </div>
                <div className="text-sm text-green-700">Training Data</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-lg font-bold text-blue-600">
                  {connection.trained_at ? new Date(connection.trained_at).toLocaleDateString() : 'Today'}
                </div>
                <div className="text-sm text-blue-700">Trained Date</div>
              </div>
            </div>
            
            <button
              onClick={handleStartTraining}
              disabled={training}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {training ? 'Retraining...' : 'Retrain Model'}
            </button>
          </div>
        ) : canTrain ? (
          <div className="text-center py-8">
            <Zap size={48} className="mx-auto text-yellow-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Train Model</h3>
            <p className="text-gray-600 mb-6">
              Train the AI model using your database schema
              {connection.generated_examples_count && connection.generated_examples_count > 0
                ? ` and ${connection.generated_examples_count} training examples.`
                : '. You can optionally generate training examples for better accuracy.'
              }
            </p>
            
            {/* Training Options Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
              <h4 className="font-medium text-blue-800 mb-2">Training Options:</h4>
              <ul className="text-blue-700 text-sm space-y-1">
                <li>✅ <strong>Schema-based training</strong>: Uses your table structure and column information</li>
                {connection.column_descriptions_uploaded && (
                  <li>✅ <strong>Column descriptions</strong>: Enhanced with uploaded descriptions</li>
                )}
                {connection.generated_examples_count && connection.generated_examples_count > 0 ? (
                  <li>✅ <strong>Training examples</strong>: {connection.generated_examples_count} question-SQL pairs</li>
                ) : (
                  <li>⭕ <strong>Training examples</strong>: Optional - generate for better accuracy</li>
                )}
              </ul>
            </div>
            
            <button
              onClick={handleStartTraining}
              disabled={training}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {training ? 'Starting Training...' : 'Start Training'}
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Training Not Available</h3>
            <p className="text-gray-600 mb-4">
              Connection must be successfully tested before training can begin.
            </p>
            <p className="text-sm text-gray-500">
              Current status: <span className="font-medium">{connection.status}</span>
            </p>
          </div>
        )}
        
        {training && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-800 mb-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="font-medium">Training in progress...</span>
            </div>
            
            {/* Progress Bar */}
            {trainingProgress > 0 && (
              <div className="mb-3">
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${trainingProgress}%` }}
                  ></div>
                </div>
                <div className="text-right text-xs text-blue-600 mt-1">
                  {trainingProgress}%
                </div>
              </div>
            )}
            
            <p className="text-blue-700 text-sm">
              {trainingPhase || `The model is learning your database structure${connection.generated_examples_count && connection.generated_examples_count > 0 ? ' and training examples' : ''}. This may take a few minutes.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export { TrainingTab };