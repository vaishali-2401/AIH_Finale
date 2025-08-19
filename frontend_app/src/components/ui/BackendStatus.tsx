'use client';

import { useState, useEffect, useCallback } from 'react';

interface BackendStatusProps {
  apiUrl?: string;
}

export default function BackendStatus({ apiUrl }: BackendStatusProps) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkBackendStatus = useCallback(async () => {
    const backendUrl = apiUrl || process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

    try {
      setStatus('checking');
      // Use list_pdfs as a lightweight health probe since /health is not implemented in backend
      const response = await fetch(`${backendUrl}/list_pdfs`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        setStatus('online');
      } else {
        setStatus('offline');
      }
    } catch (error) {
      console.log('Backend health check failed:', error);
      setStatus('offline');
    } finally {
      setLastCheck(new Date());
    }
  }, [apiUrl]);

  useEffect(() => {
    checkBackendStatus();

    // Check every 30 seconds
    const interval = setInterval(checkBackendStatus, 30000);

    return () => clearInterval(interval);
  }, [apiUrl, checkBackendStatus]);

  const getStatusColor = () => {
    switch (status) {
      case 'online': return 'text-green-600 dark:text-green-400';
      case 'offline': return 'text-red-600 dark:text-red-400';
      case 'checking': return 'text-yellow-600 dark:text-yellow-400';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'online': return '🟢';
      case 'offline': return '🔴';
      case 'checking': return '🟡';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'online': return 'Backend Online';
      case 'offline': return 'Backend Offline';
      case 'checking': return 'Checking...';
    }
  };

  return (
    <div className="flex items-center space-x-2 text-sm">
      <span>{getStatusIcon()}</span>
      <span className={`font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </span>
      {lastCheck && status !== 'checking' && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ({lastCheck.toLocaleTimeString()})
        </span>
      )}
      <button
        onClick={checkBackendStatus}
        disabled={status === 'checking'}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
      >
        Refresh
      </button>
    </div>
  );
}
