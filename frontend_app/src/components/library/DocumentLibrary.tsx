'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient, DocumentInfo } from '@/lib/api-client';

interface DocumentLibraryProps {
  onDocumentSelect: (document: DocumentInfo) => void;
  selectedDocumentId?: string;
}

export default function DocumentLibrary({ 
  onDocumentSelect, 
  selectedDocumentId 
}: DocumentLibraryProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const docs = await apiClient.getDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getDocumentIcon = (fileName: string) => {
    if (fileName.toLowerCase().includes('financial')) return '💰';
    if (fileName.toLowerCase().includes('report')) return '📊';
    if (fileName.toLowerCase().includes('strategy')) return '🎯';
    if (fileName.toLowerCase().includes('analysis')) return '📈';
    return '📄';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center space-y-2">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading documents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-6">
        <div className="text-red-500 text-lg mb-2">⚠️</div>
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          onClick={loadDocuments}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
          Document Library
        </h2>
        
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {filteredDocuments.length} of {documents.length} documents
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-5xl mb-4">📚</div>
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm ? 'No documents match your search' : 'No documents uploaded yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocuments.map((doc, index) => (
              <div
                key={(doc.id && doc.id.trim()) ? doc.id : `${doc.name || 'doc'}-${index}`}
                onClick={() => onDocumentSelect(doc)}
                className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                  selectedDocumentId === doc.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500 ring-opacity-50'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-700'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="text-2xl flex-shrink-0">
                    {getDocumentIcon(doc.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {doc.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Uploaded: {formatDate(doc.uploadedAt)}
                    </p>
                    <div className="flex items-center mt-2 space-x-4 text-xs text-gray-400">
                      <span className="flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                        </svg>
                        PDF
                      </span>
                      {selectedDocumentId === doc.id && (
                        <span className="flex items-center text-blue-500">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Selected
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refresh Button */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={loadDocuments}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors flex items-center justify-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh Library</span>
        </button>
      </div>
    </div>
  );
}
