import React, { useState, useEffect } from 'react';
import { ModelDetail, ModelTrackedTable, ModelTrackedColumn } from '../../types/models';
import { getModelTrackedTables, addTrackedTable, removeTrackedTable, updateTrackedColumns } from '../../services/models';
import { getConnectionTables, getTableColumns } from '../../services/connections';

interface ModelTablesProps {
  model: ModelDetail;
  onModelUpdate: (model: ModelDetail) => void;
}

const ModelTables: React.FC<ModelTablesProps> = ({ model, onModelUpdate }) => {
  const [trackedTables, setTrackedTables] = useState<ModelTrackedTable[]>([]);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingTable, setAddingTable] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<{[tableId: string]: any[]}>({});

  useEffect(() => {
    loadTrackedTables();
    loadAvailableTables();
  }, [model.id]);

  const loadTrackedTables = async () => {
    try {
      const tables = await getModelTrackedTables(model.id);
      setTrackedTables(tables);
      
      // Load columns for each tracked table
      for (const table of tables) {
        try {
          const columns = await getTableColumns(model.connection_id, table.table_name);
          setTableColumns(prev => ({
            ...prev,
            [table.id]: columns
          }));
        } catch (error) {
          console.error(`Failed to load columns for table ${table.table_name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load tracked tables:', error);
    }
  };

  const loadAvailableTables = async () => {
    try {
      const tables = await getConnectionTables(model.connection_id);
      setAvailableTables(tables);
    } catch (error) {
      console.error('Failed to load available tables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTable = async () => {
    if (!selectedTable) return;

    try {
      setAddingTable(true);
      await addTrackedTable(model.id, selectedTable);
      await loadTrackedTables();
      setSelectedTable('');
    } catch (error) {
      console.error('Failed to add tracked table:', error);
    } finally {
      setAddingTable(false);
    }
  };

  const handleRemoveTable = async (tableId: string) => {
    if (!window.confirm('Are you sure you want to remove this table? This will also remove all training data associated with it.')) {
      return;
    }

    try {
      await removeTrackedTable(model.id, tableId);
      await loadTrackedTables();
    } catch (error) {
      console.error('Failed to remove tracked table:', error);
    }
  };

  const handleToggleColumns = async (tableId: string, columns: ModelTrackedColumn[]) => {
    try {
      await updateTrackedColumns(model.id, tableId, columns);
      await loadTrackedTables();
    } catch (error) {
      console.error('Failed to update tracked columns:', error);
    }
  };

  const getUnusedTables = () => {
    const trackedTableNames = trackedTables.map(t => t.table_name);
    return availableTables.filter(table => !trackedTableNames.includes(table));
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
      {/* Add Table Section */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Add Tracked Table</h3>
        </div>
        <div className="px-6 py-4">
          <div className="flex space-x-4">
            <div className="flex-1">
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">Select a table to track</option>
                {getUnusedTables().map((table) => (
                  <option key={table} value={table}>
                    {table}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddTable}
              disabled={!selectedTable || addingTable}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {addingTable ? 'Adding...' : 'Add Table'}
            </button>
          </div>
        </div>
      </div>

      {/* Tracked Tables List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Tracked Tables</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {trackedTables.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No tables tracked</h3>
              <p className="mt-1 text-sm text-gray-500">Add a table above to start tracking it.</p>
            </div>
          ) : (
            trackedTables.map((table) => (
              <div key={table.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setExpandedTable(expandedTable === table.id ? null : table.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg
                        className={`w-5 h-5 transform transition-transform ${expandedTable === table.id ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{table.table_name}</h4>
                      <p className="text-sm text-gray-500">
                        Table tracked
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveTable(table.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>

                {expandedTable === table.id && (
                  <div className="mt-4 pl-8">
                    <TableColumnsManager
                      table={table}
                      columns={tableColumns[table.id] || []}
                      onUpdateColumns={(columns) => handleToggleColumns(table.id, columns)}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-component for managing table columns
interface TableColumnsManagerProps {
  table: ModelTrackedTable;
  columns: any[];
  onUpdateColumns: (columns: ModelTrackedColumn[]) => void;
}

const TableColumnsManager: React.FC<TableColumnsManagerProps> = ({ table, columns, onUpdateColumns }) => {
  const handleColumnToggle = (columnId: string) => {
    const currentTracked = columns.filter(c => c.is_tracked).map(c => c.id) || [];
    const newTracked = currentTracked.includes(columnId)
      ? currentTracked.filter(id => id !== columnId)
      : [...currentTracked, columnId];
    
    const updatedColumns = columns.map(col => ({
      ...col,
      is_tracked: newTracked.includes(col.id)
    })) || [];
    
    onUpdateColumns(updatedColumns);
  };

  return (
    <div className="space-y-2">
      <h5 className="text-sm font-medium text-gray-700">Tracked Columns</h5>
      <div className="space-y-1">
        {columns.map((column) => {
          const isTracked = column.is_tracked;
          return (
            <label key={column.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={isTracked}
                onChange={() => handleColumnToggle(column.id)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-900">{column.name}</span>
              <span className="text-xs text-gray-500">({column.data_type})</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default ModelTables;
