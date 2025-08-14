import React, { useState, useEffect } from 'react';
import { ModelDetail } from '../../types/models';
import { trainModel, getTrainingData } from '../../services/training';

interface ModelTrainingProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
}

const ModelTraining: React.FC<ModelTrainingProps> = ({ model, onModelUpdate }) => {
  const [training, setTraining] = useState(false);
  const [trainingData, setTrainingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    try {
      setTraining(true);
      await trainModel(model.id);
      // Refresh model data to get updated status
      // This would typically be handled by a real-time update or polling
    } catch (error) {
      console.error('Failed to train model:', error);
    } finally {
      setTraining(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Model Training</h3>
            <p className="text-sm text-gray-500">Train your model with the prepared training data</p>
          </div>
          <button
            onClick={handleTrainModel}
            disabled={training || model.status === 'training'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {training ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Training...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Train Model</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Documentation</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : (trainingData?.documentation?.length || 0)}
                </p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Questions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : (trainingData?.questions?.length || 0)}
                </p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Table Schema</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : (trainingData?.columns?.length || 0)}
                </p>
              </div>
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelTraining; 