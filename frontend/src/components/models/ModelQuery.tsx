import React, { useState } from 'react';
import { ModelDetail } from '../../types/models';
import { queryModel } from '../../services/training';

interface ModelQueryProps {
  model: ModelDetail;
}

const ModelQuery: React.FC<ModelQueryProps> = ({ model }) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      
      const response = await queryModel(model.id, query);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query model');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResult(null);
    setError(null);
  };

  const sampleQueries = [
    "Show me all users",
    "What are the top 10 products by sales?",
    "How many orders were placed last month?",
    "Find customers who haven't ordered in 30 days",
    "What's the average order value?",
  ];

  return (
    <div className="space-y-6">
      {/* Query Input */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Query Your Model</h3>
          <p className="mt-1 text-sm text-gray-500">
            Ask questions about your data in natural language
          </p>
        </div>
        <div className="px-6 py-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="query" className="block text-sm font-medium text-gray-700">
                Your Question
              </label>
              <textarea
                id="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={3}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="e.g., Show me all users who signed up in the last month"
                disabled={loading || model.status !== 'active'}
              />
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={!query.trim() || loading || model.status !== 'active'}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Ask Question'
                )}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            {model.status !== 'active' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Model not ready for queries
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>
                        This model needs to be trained before you can query it. 
                        Go to the Training tab to generate training data and train the model.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Sample Queries */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Sample Queries</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try these example questions to get started
          </p>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sampleQueries.map((sampleQuery, index) => (
              <button
                key={index}
                onClick={() => setQuery(sampleQuery)}
                disabled={loading || model.status !== 'active'}
                className="text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <p className="text-sm text-gray-900">{sampleQuery}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Query Result</h3>
          </div>
          <div className="px-6 py-4">
            <div className="space-y-4">
              {/* SQL Query */}
              {result.sql && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Generated SQL</h4>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <code className="text-sm text-gray-900 whitespace-pre-wrap">{result.sql}</code>
                  </div>
                </div>
              )}

              {/* Results Table */}
              {result.results && result.results.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Results</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(result.results[0]).map((column) => (
                            <th
                              key={column}
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {result.results.map((row: any, index: number) => (
                          <tr key={index}>
                            {Object.values(row).map((value: any, colIndex: number) => (
                              <td
                                key={colIndex}
                                className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                              >
                                {value !== null && value !== undefined ? String(value) : 'NULL'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Showing {result.results.length} result{result.results.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}

              {/* No Results */}
              {result.results && result.results.length === 0 && (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Your query didn't return any data. Try modifying your question.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelQuery;
