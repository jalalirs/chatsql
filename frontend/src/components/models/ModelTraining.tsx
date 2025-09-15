import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Clock, Zap, Download } from 'lucide-react';
import { ModelDetail } from '../../types/models';
import { trainModel, getTrainingData } from '../../services/training';
import { downloadModel } from '../../services/models';
import { sseConnection } from '../../services/sse';

interface ModelTrainingProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
}

const ModelTraining: React.FC<ModelTrainingProps> = ({ model, onModelUpdate }) => {
  const [training, setTraining] = useState(false);
  const [trainingData, setTrainingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingPhase, setTrainingPhase] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadTrainingData();
  }, [model.id]);

  const loadTrainingData = async () => {
    try {
      setLoading(true);
      const data = await getTrainingData(model.id);
      setTrainingData(data);
    } catch (error) {
      console.error('Failed to load training data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTrainModel = async () => {
    setTraining(true);
    setError(null);
    setTrainingProgress(0);
    setTrainingPhase('Starting training...');
    
    try {
      console.log('🚀 Starting model training for model:', model.id);
      
      // Call the backend training endpoint
      const result = await trainModel(model.id);
      console.log('📡 Training task started:', result);

      // For now, simulate progress since SSE is not implemented yet
      setTrainingPhase('Training in progress...');
      setTrainingProgress(50);
      
      // Simulate training completion after a delay
      setTimeout(() => {
        setTraining(false);
        setTrainingProgress(100);
        setTrainingPhase('Training completed successfully!');
        
        // Update model status in the UI
        onModelUpdate({
          ...model,
          status: 'trained'
        });
        
        // Clear progress after a moment
        setTimeout(() => {
          setTrainingProgress(0);
          setTrainingPhase('');
        }, 3000);
      }, 3000); // Simulate 3 seconds of training
      
    } catch (err: any) {
      console.error('Failed to start training:', err);
      setError(err.response?.data?.detail || err.message);
      setTraining(false);
      setTrainingProgress(0);
      setTrainingPhase('');
    }
  };

  const handleDownloadModel = async () => {
    setDownloading(true);
    setError(null);
    
    try {
      const blob = await downloadModel(model.id);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${model.name}_model.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (err: any) {
      console.error('Failed to download model:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to download model');
    } finally {
      setDownloading(false);
    }
  };

  // Can train if model is ready (has training data)
  const canTrain = trainingData && (trainingData.documentation?.length > 0 || trainingData.questions?.length > 0 || trainingData.columns?.length > 0);

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

        {(model.status as string) === 'trained' ? (
          <div className="text-center py-8">
            <CheckCircle size={48} className="mx-auto text-green-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Model Trained Successfully!</h3>
            <p className="text-gray-600 mb-6">
              Your AI model is ready to answer questions about your data. 
              You can now use it in the query interface.
            </p>
            
            {/* Training Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6 max-w-lg mx-auto">
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-lg font-bold text-green-600">
                  {trainingData?.documentation?.length || 0}
                </div>
                <div className="text-sm text-green-700">Documentation</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-lg font-bold text-blue-600">
                  {trainingData?.questions?.length || 0}
                </div>
                <div className="text-sm text-blue-700">Questions</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-lg font-bold text-purple-600">
                  {trainingData?.columns?.length || 0}
                </div>
                <div className="text-sm text-purple-700">Columns</div>
              </div>
            </div>
            
            {/* Debug info */}
            <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
              Debug: Model status = {model.status}, Downloading = {downloading.toString()}
              <br />
              Model ID = {model.id}
              <br />
              Download button should be visible!
            </div>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleDownloadModel}
                disabled={downloading}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Download size={16} />
                {downloading ? 'Downloading...' : 'Download Model'}
              </button>
              
              <button
                onClick={handleTrainModel}
                disabled={training}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {training ? 'Retraining...' : 'Retrain Model'}
              </button>
            </div>
            
            {/* Test button */}
            <div className="mt-4">
              <button
                onClick={() => console.log('Download button clicked!', { modelId: model.id, status: model.status })}
                className="px-4 py-2 bg-red-500 text-white rounded"
              >
                TEST DOWNLOAD BUTTON
              </button>
            </div>
          </div>
        ) : canTrain ? (
          <div className="text-center py-8">
            <Zap size={48} className="mx-auto text-yellow-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Train Model</h3>
            <p className="text-gray-600 mb-6">
              Train the AI model using your prepared training data.
            </p>
            
            {/* Training Options Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
              <h4 className="font-medium text-blue-800 mb-2">Training Data Available:</h4>
              <ul className="text-blue-700 text-sm space-y-1">
                {trainingData?.documentation?.length > 0 && (
                  <li>✅ <strong>Documentation</strong>: {trainingData.documentation.length} items</li>
                )}
                {trainingData?.questions?.length > 0 && (
                  <li>✅ <strong>Training Questions</strong>: {trainingData.questions.length} question-SQL pairs</li>
                )}
                {trainingData?.columns?.length > 0 && (
                  <li>✅ <strong>Column Descriptions</strong>: {trainingData.columns.length} columns with descriptions</li>
                )}
              </ul>
            </div>
            
            <div className="flex gap-3 justify-center">
              {(model.status as string) === 'trained' && (
                <button
                  onClick={handleDownloadModel}
                  disabled={downloading}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Download size={16} />
                  {downloading ? 'Downloading...' : 'Download Model'}
                </button>
              )}
              
              <button
                onClick={handleTrainModel}
                disabled={training}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {training ? 'Starting Training...' : 'Start Training'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Training Not Available</h3>
            <p className="text-gray-600 mb-4">
              Add training data (documentation, questions, or column descriptions) before training can begin.
            </p>
            <p className="text-sm text-gray-500">
              Go to the "Training Data" tab to add your training materials.
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
              {trainingPhase || 'The model is learning from your training data. This may take a few minutes.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelTraining; 