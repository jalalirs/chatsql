import React, { useState, useEffect } from 'react';
import { ModelDetail } from '../../types/models';
import { getTrainingData, generateTrainingData, trainModel } from '../../services/training';

interface ModelTrainingProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
}

const ModelTraining: React.FC<ModelTrainingProps> = ({ model, onModelUpdate }) => {
  const [trainingData, setTrainingData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [training, setTraining] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'documentation' | 'questions' | 'columns'>('overview');

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

  const handleGenerateData = async () => {
    try {
      setGenerating(true);
      await generateTrainingData(model.id, 50); // Default to 50 examples
      await loadTrainingData();
    } catch (error) {
      console.error('Failed to generate training data:', error);
    } finally {
      setGenerating(false);
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

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Training Overview */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Training Overview</h3>
            <div className="flex space-x-3">
              <button
                onClick={handleGenerateData}
                disabled={generating || model.status === 'training'}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {generating ? 'Generating...' : 'Generate Data'}
              </button>
              <button
                onClick={handleTrainModel}
                disabled={training || model.status === 'training' || !trainingData}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {training ? 'Training...' : 'Train Model'}
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Documentation</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {trainingData?.documentation?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Questions</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {trainingData?.questions?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Columns</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {trainingData?.columns?.length || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Training Data Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview' },
              { id: 'documentation', name: 'Documentation' },
              { id: 'questions', name: 'Questions' },
              { id: 'columns', name: 'Columns' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
        <div className="px-6 py-4">
          {activeTab === 'overview' && (
            <TrainingOverview trainingData={trainingData} />
          )}
          {activeTab === 'documentation' && (
            <TrainingDocumentation trainingData={trainingData} modelId={model.id} onUpdate={loadTrainingData} />
          )}
          {activeTab === 'questions' && (
            <TrainingQuestions trainingData={trainingData} modelId={model.id} onUpdate={loadTrainingData} />
          )}
          {activeTab === 'columns' && (
            <TrainingColumns trainingData={trainingData} modelId={model.id} onUpdate={loadTrainingData} />
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-components for different training data types
const TrainingOverview: React.FC<{ trainingData: any }> = ({ trainingData }) => (
  <div className="space-y-4">
    <div>
      <h4 className="text-sm font-medium text-gray-900">Training Status</h4>
      <p className="mt-1 text-sm text-gray-500">
        {trainingData?.documentation?.length > 0 && trainingData?.questions?.length > 0
          ? 'Ready for training'
          : 'Generate training data to start training'}
      </p>
    </div>
    
    {trainingData?.documentation?.length > 0 && (
      <div>
        <h4 className="text-sm font-medium text-gray-900">Recent Documentation</h4>
        <div className="mt-2 space-y-2">
          {trainingData.documentation.slice(0, 3).map((doc: any, index: number) => (
            <div key={index} className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              {doc.content.substring(0, 100)}...
            </div>
          ))}
        </div>
      </div>
    )}

    {trainingData?.questions?.length > 0 && (
      <div>
        <h4 className="text-sm font-medium text-gray-900">Sample Questions</h4>
        <div className="mt-2 space-y-2">
          {trainingData.questions.slice(0, 3).map((q: any, index: number) => (
            <div key={index} className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
              <strong>Q:</strong> {q.question}<br />
              <strong>A:</strong> {q.answer}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const TrainingDocumentation: React.FC<{ trainingData: any; modelId: string; onUpdate: () => void }> = ({ trainingData, modelId, onUpdate }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <h4 className="text-sm font-medium text-gray-900">Documentation</h4>
      <button className="text-sm text-indigo-600 hover:text-indigo-500">Add New</button>
    </div>
    <div className="space-y-3">
      {trainingData?.documentation?.map((doc: any, index: number) => (
        <div key={index} className="border rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-sm text-gray-900">{doc.content}</p>
              <p className="text-xs text-gray-500 mt-2">Table: {doc.table_name}</p>
            </div>
            <div className="flex space-x-2 ml-4">
              <button className="text-sm text-gray-500 hover:text-gray-700">Edit</button>
              <button className="text-sm text-red-600 hover:text-red-700">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const TrainingQuestions: React.FC<{ trainingData: any; modelId: string; onUpdate: () => void }> = ({ trainingData, modelId, onUpdate }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <h4 className="text-sm font-medium text-gray-900">Questions & Answers</h4>
      <button className="text-sm text-indigo-600 hover:text-indigo-500">Add New</button>
    </div>
    <div className="space-y-3">
      {trainingData?.questions?.map((q: any, index: number) => (
        <div key={index} className="border rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Q: {q.question}</p>
              <p className="text-sm text-gray-600 mt-2">A: {q.answer}</p>
              <p className="text-xs text-gray-500 mt-2">Table: {q.table_name}</p>
            </div>
            <div className="flex space-x-2 ml-4">
              <button className="text-sm text-gray-500 hover:text-gray-700">Edit</button>
              <button className="text-sm text-red-600 hover:text-red-700">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const TrainingColumns: React.FC<{ trainingData: any; modelId: string; onUpdate: () => void }> = ({ trainingData, modelId, onUpdate }) => (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <h4 className="text-sm font-medium text-gray-900">Column Descriptions</h4>
      <button className="text-sm text-indigo-600 hover:text-indigo-500">Add New</button>
    </div>
    <div className="space-y-3">
      {trainingData?.columns?.map((col: any, index: number) => (
        <div key={index} className="border rounded-lg p-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{col.column_name}</p>
              <p className="text-sm text-gray-600 mt-1">{col.description}</p>
              <p className="text-xs text-gray-500 mt-2">Table: {col.table_name} | Type: {col.data_type}</p>
            </div>
            <div className="flex space-x-2 ml-4">
              <button className="text-sm text-gray-500 hover:text-gray-700">Edit</button>
              <button className="text-sm text-red-600 hover:text-red-700">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default ModelTraining;
