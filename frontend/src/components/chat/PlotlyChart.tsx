// First, install plotly.js-basic-dist:
// npm install plotly.js-basic-dist react-plotly.js @types/react-plotly.js

// Create a new component: PlotlyChart.tsx
import React from 'react';
import Plot from 'react-plotly.js';
import { Config } from 'plotly.js'; // Import the Config type from plotly.js

interface PlotlyChartProps {
  chartData: any; // Plotly figure object from backend
  className?: string;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({ chartData, className = '' }) => {
  if (!chartData || !chartData.data) {
    return (
      <div className="text-center text-gray-500 p-4">
        No chart data available
      </div>
    );
  }

  // Ensure layout has responsive settings
  const layout = {
    ...chartData.layout,
    autosize: true,
    margin: { l: 50, r: 30, t: 50, b: 50 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: 'system-ui, -apple-system, sans-serif',
      size: 12,
      color: '#374151'
    },
    xaxis: {
      ...chartData.layout?.xaxis,
      gridcolor: '#e5e7eb',
      linecolor: '#e5e7eb'
    },
    yaxis: {
      ...chartData.layout?.yaxis,
      gridcolor: '#e5e7eb',
      linecolor: '#e5e7eb'
    }
  };

  const config: Partial<Config> = { // Explicitly type config as Partial<Config>
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
    toImageButtonOptions: {
      format: 'png', // This 'png' is already a literal.
      filename: 'chart',
      height: 500,
      width: 700,
      scale: 1
    }
  };

  return (
    // Corrected template literal for className
    <div className={`w-full ${className}`}> 
      <Plot
        data={chartData.data}
        layout={layout}
        config={config}
        style={{ width: '100%', height: '400px' }}
        useResizeHandler={true}
      />
    </div>
  );
};