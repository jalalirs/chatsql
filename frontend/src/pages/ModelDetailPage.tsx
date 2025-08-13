import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ModelDetail } from '../types/models';
import { getModel } from '../services/models';
import ModelHeader from '../components/models/ModelHeader';
import ModelTabs from '../components/models/ModelTabs';
import ModelOverview from '../components/models/ModelOverview';
import ModelTraining from '../components/models/ModelTraining';
import ModelTables from '../components/models/ModelTables';
import ModelQuery from '../components/models/ModelQuery';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';

type TabType = 'overview' | 'training' | 'tables' | 'query';

const ModelDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<ModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (id) {
      loadModel();
    }
  }, [id]);

  const loadModel = async () => {
    try {
      setLoading(true);
      setError(null);
      const modelData = await getModel(id!);
      setModel(modelData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      setLoading(false);
    }
  };

  const handleModelUpdate = (updatedModel: ModelDetail) => {
    setModel(updatedModel);
  };

  const handleBackToModels = () => {
    navigate('/models');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!model) {
    return <ErrorMessage message="Model not found" />;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <ModelOverview model={model} onModelUpdate={handleModelUpdate} />;
      case 'training':
        return <ModelTraining model={model} onModelUpdate={handleModelUpdate} />;
      case 'tables':
        return <ModelTables model={model} onModelUpdate={handleModelUpdate} />;
      case 'query':
        return <ModelQuery model={model} />;
      default:
        return <ModelOverview model={model} onModelUpdate={handleModelUpdate} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <ModelHeader 
          model={model} 
          onModelUpdate={handleModelUpdate}
          onBack={handleBackToModels}
        />

        {/* Tabs */}
        <ModelTabs 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          model={model}
        />

        {/* Tab Content */}
        <div className="mt-8">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default ModelDetailPage;
