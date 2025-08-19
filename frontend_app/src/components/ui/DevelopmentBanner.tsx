'use client';

import { useState } from 'react';

export default function DevelopmentBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-blue-600 dark:text-blue-400">
            ℹ️
          </div>
          <div>
            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
              Frontend Demo Mode
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-300">
              This is the frontend application. Backend integration is needed for full functionality.
              <span className="ml-2">
                <strong>Working:</strong> PDF display, UI components
                <span className="mx-2">•</span>
                <strong>Requires Backend:</strong> Upload, AI features, recommendations
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 p-1"
          aria-label="Dismiss banner"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
