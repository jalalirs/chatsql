import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  className?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, className = '' }) => {
  return (
    <div className={`flex items-center p-4 mb-4 text-red-800 border border-red-300 rounded-lg bg-red-50 ${className}`}>
      <AlertCircle className="flex-shrink-0 w-5 h-5 mr-2" />
      <span className="sr-only">Error</span>
      <div className="text-sm font-medium">{message}</div>
    </div>
  );
};

export default ErrorMessage;
