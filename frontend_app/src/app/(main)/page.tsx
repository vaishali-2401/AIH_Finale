'use client';

import { useState, useCallback, useRef } from "react";
import PdfViewer from "@/components/pdf/PdfViewer";
import Sidebar from "@/components/layout/Sidebar";
import InsightsButton from "@/components/ui/InsightsButton";
import PodcastButton from "@/components/ui/PodcastButton";
import BackendStatus from "@/components/ui/BackendStatus";
import DevelopmentBanner from "@/components/ui/DevelopmentBanner";
import BulkPdfUpload from "@/components/upload/BulkPdfUpload";
import DocumentLibrary from "@/components/library/DocumentLibrary";
import { apiClient, type BackendRecommendation, type BackendInsightResponse } from "@/lib/api-client";
import { captureTextSelectionScreenshot } from "@/lib/screenshot";
import SinglePdfOpen from "@/components/upload/SinglePdfOpen";

// Type Definitions
interface ViewerAPIs {
  goToLocation: (page: number) => void;
  addAnnotations: (annotations: { pageNumber: number; type: "HIGHLIGHT"; boundingBox: [number, number, number, number]; color: string; opacity: number; }[]) => Promise<void>;
  getSelectedContent: () => Promise<{ text: string }>;
}
interface DocumentFile {
  id?: string;
  url: string | null;
  name: string;
  file?: File;
}

interface Document {
  id: string;
  name: string;
  uploadedAt: string;
}

export default function DocumentViewPage() {
  // State Management
  const [document, setDocument] = useState<DocumentFile | null>(null);
  const [viewerApis, setViewerApis] = useState<ViewerAPIs | null>(null);
  const [recommendations, setRecommendations] = useState<BackendRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<{ pageNumber: number; type: "HIGHLIGHT"; boundingBox: [number, number, number, number]; color: string; opacity: number; }[]>([]);
  const [insights, setInsights] = useState<BackendInsightResponse | null>(null);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  const [currentView, setCurrentView] = useState<'upload' | 'library' | 'viewer'>('upload');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const selectionTimerRef = useRef<number | null>(null);
  // Removed lastSelectedText as we now use direct page screenshots

  // Memoized Handlers

  const handleViewerReady = useCallback((apis: ViewerAPIs) => {
    setViewerApis(apis);
  }, []);

  // Removed fetchRecommendations as we now use direct screenshot analysis

  // Current page retrieval is handled by the viewer APIs when available

  const processSelectionWithScreenshot = useCallback(async (text: string) => {
    if (!viewerApis) return;
    if (!text || !text.trim()) return;

    try {
      setIsLoading(true);
      setError(null);
      setInsights(null);

      const pdfViewerElement = window.document.getElementById('adobe-pdf-viewer');
      if (!pdfViewerElement) throw new Error('PDF viewer element not found');

      const screenshot = await captureTextSelectionScreenshot(pdfViewerElement, text.trim());
      const result = await apiClient.extractAndSearch(screenshot, text.trim());
      setRecommendations(result.recommendations || []);
    } catch (err) {
      console.error('Automatic selection processing failed:', err);
      setError('Failed to process selection. Try again.');
    } finally {
      setIsLoading(false);
    }
  }, [viewerApis]);

  const handleTextSelect = useCallback((selectedText: string) => {
    // Clear any previous highlight on a fresh selection
    setAnnotations([]);
    // Debounce automatic processing to avoid rapid consecutive calls
    if (selectionTimerRef.current) {
      window.clearTimeout(selectionTimerRef.current);
    }
    selectionTimerRef.current = window.setTimeout(() => {
      processSelectionWithScreenshot(selectedText);
    }, 600);
  }, [processSelectionWithScreenshot]);

  const handleJumpToPage = useCallback((recommendation: BackendRecommendation) => {
    if (viewerApis) {
      viewerApis.goToLocation(recommendation.pageNumber);
      const newAnnotation: { pageNumber: number; type: "HIGHLIGHT"; boundingBox: [number, number, number, number]; color: string; opacity: number } = { pageNumber: recommendation.pageNumber, type: "HIGHLIGHT", boundingBox: recommendation.boundingBox, color: "#FBBF24", opacity: 0.4 };
      setAnnotations([newAnnotation]);
    }
  }, [viewerApis]);

  const handleFetchInsights = useCallback(async () => {
    if (insights) {
      setInsights(null);
      return;
    }
    setIsInsightsLoading(true);
    setRecommendations([]);
    setError(null);
    
    try {
      console.log('🧠 Insights button clicked!');
      
      // Try to get selected text for better context
      let selectedText = "Generate insights for this document page";
      if (viewerApis) {
        try {
          const selection = await viewerApis.getSelectedContent();
          const text = (selection?.text || '').trim();
          if (text) {
            selectedText = `Generate insights for: ${text}`;
            console.log('📋 Using selected text for insights:', text);
          } else {
            console.log('📄 No text selected, generating general insights');
          }
        } catch {
          console.log('📄 Fallback to general insights mode');
        }
      }
      
      // Create a simple mock screenshot since backend needs an image file
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
      }
      
      const mockScreenshot = await new Promise<File>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], 'insights_analysis.png', { type: 'image/png' }));
          }
        });
      });
      
      console.log('🔍 Running analysis for insights context...');
      await apiClient.extractAndSearch(mockScreenshot, selectedText);

      // Fetch insights (backend will use the context from the search)
      console.log('🧠 Generating insights...');
      const data = await apiClient.getInsights();
      setInsights(data);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to fetch insights. Please try again.';
      setError(message);
    } finally {
      setIsInsightsLoading(false);
    }
  }, [insights, viewerApis]);

  const handleUseSelection = useCallback(async () => {
    console.log('🚀 Analyze Page button clicked!');
    
    setIsLoading(true);
    setError(null);
    setInsights(null);
    
    try {
      // Try to get any selected text or use fallback
      let selectedText = "Please analyze this document page and find related content";
      if (viewerApis) {
        try {
          const selection = await viewerApis.getSelectedContent();
          const text = (selection?.text || '').trim();
          if (text) {
            selectedText = text;
            console.log('📋 Using selected text:', selectedText);
          } else {
            console.log('📄 No text selected, using page analysis mode');
          }
        } catch {
          console.log('📄 Fallback to page analysis mode');
        }
      }
      
      // Create a simple mock screenshot (1x1 pixel) since backend needs an image file
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
      }
      
      const mockScreenshot = await new Promise<File>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], 'page_analysis.png', { type: 'image/png' }));
          }
        });
      });
      
      console.log('📤 Sending text analysis request to backend...');
      const result = await apiClient.extractAndSearch(mockScreenshot, selectedText);
      console.log('🔍 Backend results:', result);
      
      // Display recommendations in sidebar
      setRecommendations(result.recommendations || []);
      
    } catch (error) {
      console.error('❌ Error in handleUseSelection:', error);
      setError("Failed to analyze page. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [viewerApis]);

  // New handlers for bulk upload and document selection
  const handleUploadComplete = useCallback((uploadedFiles: string[]) => {
    console.log('Upload completed:', uploadedFiles);
    setCurrentView('library');
  }, []);

  const handleDocumentSelect = useCallback((doc: Document) => {
    setSelectedDocument(doc);
    // Load the document URL served by backend
    setDocument({
      id: doc.id,
      url: apiClient.getPdfUrl(doc.name),
      name: doc.name,
    });
    setCurrentView('viewer');
    setViewerApis(null);
    setRecommendations([]);
    setAnnotations([]);
    setInsights(null);
    setError(null);
  }, []);

  const handleBackToLibrary = useCallback(() => {
    setCurrentView('library');
    setDocument(null);
    setSelectedDocument(null);
  }, []);

  const handleBackToUpload = useCallback(() => {
    setCurrentView('upload');
    setDocument(null);
    setSelectedDocument(null);
  }, []);

  const handleOpenSinglePdf = useCallback((file: File) => {
    setDocument({ id: undefined, url: null, name: file.name, file });
    setCurrentView('viewer');
    setViewerApis(null);
    setRecommendations([]);
    setAnnotations([]);
    setInsights(null);
    setError(null);
  }, []);

  // JSX
  return (
    <main className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <div className="flex-1 flex flex-col">
        {/* Development Banner */}
        <DevelopmentBanner />
        {/* Header */}
        <div className="flex-shrink-0 p-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">
              Connecting the Dots
            </h1>
            
            {/* Backend Status Indicator */}
            <BackendStatus />
            
            {/* Navigation */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBackToUpload}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  currentView === 'upload' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
              >
                Upload
              </button>
              <button
                onClick={() => setCurrentView('library')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  currentView === 'library' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
              >
                Library
              </button>
              {currentView === 'viewer' && (
                <button
                  onClick={handleBackToLibrary}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 rounded text-sm font-medium transition-colors"
                >
                  ← Back to Library
                </button>
              )}
            </div>

            {/* Current document info and actions */}
            {currentView === 'viewer' && document && (
              <div className="flex items-center space-x-4">
                <span className="text-gray-600 dark:text-gray-300">{document.name}</span>
                <button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-3 rounded disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  onClick={handleUseSelection}
                  disabled={!viewerApis || isLoading}
                >
                  {isLoading ? 'Analyzing...' : 'Analyze Page'}
                </button>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  onClick={() => {
                    console.log('🧪 Testing text selection API...');
                    if (viewerApis) {
                      viewerApis.getSelectedContent().then(selection => {
                        const text = (selection?.text || '').trim();
                        console.log('🧪 Test result - Selected text:', `"${text}"`);
                        if (text) {
                          alert(`Selected text: "${text}"`);
                        } else {
                          alert('No text selected. Try selecting some text first.');
                        }
                      }).catch(error => {
                        console.error('🧪 Test failed:', error);
                        alert('Text selection API failed: ' + error.message);
                      });
                    } else {
                      alert('PDF viewer not ready yet.');
                    }
                  }}
                  disabled={!viewerApis}
                >
                  Test Selection
                </button>
              </div>
            )}
          </div>

          {/* Action buttons for viewer */}
          {currentView === 'viewer' && document && (
            <div className="flex items-center space-x-3">
              <PodcastButton 
                currentSection={insights ? JSON.stringify(insights) : undefined}
                relatedContent={recommendations.length > 0 ? recommendations.map(r => r.snippet).join('. ') : undefined}
                insights={insights || undefined}
                disabled={!viewerApis}
              />
              <InsightsButton onClick={handleFetchInsights} isLoading={isInsightsLoading} />
            </div>
          )}
        </div>
        {/* Main Content Area */}
        <div className="flex-grow min-h-0 flex">
          {currentView === 'upload' && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-5xl space-y-6">
                <BulkPdfUpload 
                  onUploadComplete={handleUploadComplete}
                  maxFiles={30}
                />
                <SinglePdfOpen onOpen={handleOpenSinglePdf} />
              </div>
            </div>
          )}

          {currentView === 'library' && (
            <div className="flex-1">
              <DocumentLibrary 
                onDocumentSelect={handleDocumentSelect}
                selectedDocumentId={selectedDocument?.id}
              />
            </div>
          )}

          {currentView === 'viewer' && (
            <div className="flex-1 flex flex-col">
              {document ? (
                <>
                  <div className="flex-1 min-h-0">
                    <PdfViewer 
                      fileUrl={document.url} 
                      fileName={document.name} 
                      file={document.file} 
                      annotations={annotations} 
                      onViewerReady={handleViewerReady} 
                      onTextSelect={handleTextSelect} 
                    />
                  </div>
                  {insights && (
                    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                      <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-100">AI Insight</h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{insights.insight}</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900">
                  <div className="text-center">
                    <div className="text-gray-400 text-6xl mb-4">📄</div>
                    <p className="text-gray-500">Select a document from the library to view.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Sidebar - only show for viewer */}
      {currentView === 'viewer' && (
        <aside className="w-96 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {isInsightsLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : insights ? (
            <div className="p-6 overflow-y-auto h-full">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">Insights</h2>
              <div className="mt-4 space-y-4">
                <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-200 text-sm leading-relaxed">
                  {insights.insight}
                </p>
              </div>
            </div>
          ) : (
            <Sidebar 
              recommendations={recommendations} 
              isLoading={isLoading} 
              error={error} 
              onJumpToPage={handleJumpToPage} 
            />
          )}
        </aside>
      )}
    </main>
  );
}