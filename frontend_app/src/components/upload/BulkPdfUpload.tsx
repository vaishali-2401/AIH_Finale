'use client';

import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

interface BulkPdfUploadProps {
  onUploadComplete: (uploadedFiles: string[]) => void;
  maxFiles?: number;
}

interface UploadProgress {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function BulkPdfUpload({ 
  onUploadComplete, 
  maxFiles = 30 
}: BulkPdfUploadProps) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList) => {
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      alert('Please select PDF files only.');
      return;
    }

    if (pdfFiles.length > maxFiles) {
      alert(`You can only upload up to ${maxFiles} files at once.`);
      return;
    }

    // Initialize upload progress
    const progress: UploadProgress[] = pdfFiles.map(file => ({
      file,
      status: 'pending'
    }));
    
    setUploadProgress(progress);
  }, [maxFiles]);

  const startUpload = useCallback(async () => {
    if (uploadProgress.length === 0) return;

    setIsUploading(true);
    
    // Update all files to uploading status
    setUploadProgress(prev => 
      prev.map(p => ({ ...p, status: 'uploading' as const }))
    );

    try {
      const files = uploadProgress.map(p => p.file);
      const result = await apiClient.uploadPDFs(files);
      
      // Mark all as success
      setUploadProgress(prev => 
        prev.map(p => ({ ...p, status: 'success' as const }))
      );
      
      onUploadComplete(result.files);
      
      // Clear progress after a delay
      setTimeout(() => {
        setUploadProgress([]);
      }, 2000);
    } catch (error) {
      console.error('Upload error:', error);
      
      // Check if it's a connection error (backend not running)
      const isConnectionError = error instanceof Error && 
        (error.message.includes('Failed to fetch') || 
         error.message.includes('ERR_CONNECTION_REFUSED') ||
         error.message.includes('NetworkError'));
      
      const errorMessage = isConnectionError 
        ? 'Backend not available. Please ensure your friend\'s backend is running.'
        : (error instanceof Error ? error.message : 'Upload failed');
      
      // Mark all as error
      setUploadProgress(prev => 
        prev.map(p => ({ 
          ...p, 
          status: 'error' as const, 
          error: errorMessage
        }))
      );
    } finally {
      setIsUploading(false);
    }
  }, [uploadProgress, onUploadComplete]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const onButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const clearFiles = useCallback(() => {
    setUploadProgress([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'pending':
        return '📄';
      case 'uploading':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📄';
    }
  };

  const getStatusColor = (status: UploadProgress['status']) => {
    switch (status) {
      case 'pending':
        return 'text-gray-600';
      case 'uploading':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
        Bulk PDF Upload
      </h2>
      
      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={handleChange}
          className="hidden"
        />
        
        <div className="space-y-4">
          <div className="text-6xl">📁</div>
          <div>
            <p className="text-lg font-medium text-gray-800 dark:text-gray-200">
              Drop PDFs here or click to browse
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Upload up to {maxFiles} PDF files at once
            </p>
          </div>
          <button
            onClick={onButtonClick}
            disabled={isUploading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
          >
            Select PDFs
          </button>
        </div>
      </div>

      {/* File List */}
      {uploadProgress.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-800 dark:text-white">
              Files to Upload ({uploadProgress.length})
            </h3>
            <div className="space-x-2">
              {!isUploading && uploadProgress.some(p => p.status === 'pending') && (
                <button
                  onClick={startUpload}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded transition-colors"
                >
                  Upload All
                </button>
              )}
              <button
                onClick={clearFiles}
                disabled={isUploading}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {uploadProgress.map((progress, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{getStatusIcon(progress.status)}</span>
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-200">
                      {progress.file.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {(progress.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${getStatusColor(progress.status)}`}>
                    {progress.status.charAt(0).toUpperCase() + progress.status.slice(1)}
                  </p>
                  {progress.error && (
                    <p className="text-xs text-red-500 dark:text-red-400">
                      {progress.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-blue-700 dark:text-blue-300 font-medium">
              Uploading {uploadProgress.length} files to backend...
            </p>
          </div>
        </div>
      )}

      {/* Backend Offline Notice */}
      {uploadProgress.length > 0 && uploadProgress.some(p => p.status === 'error' && p.error?.includes('Backend not available')) && (
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="text-yellow-600 dark:text-yellow-400 text-lg">⚠️</div>
            <div>
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                Backend Connection Required
              </h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                The backend server is not running. To test the full upload functionality:
              </p>
              <ol className="text-sm text-yellow-700 dark:text-yellow-300 list-decimal list-inside space-y-1">
                <li>Start your friend&apos;s backend server</li>
                <li>Ensure it&apos;s running on the configured URL</li>
                <li>Check that CORS is properly configured</li>
                <li>Verify the <code className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">/upload_pdfs</code> endpoint exists</li>
              </ol>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-3">
                <strong>Frontend Demo:</strong> The UI, PDF viewer, and interface components are working perfectly!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}