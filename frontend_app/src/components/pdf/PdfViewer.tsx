'use client';

import { useEffect, useRef, useState } from 'react';

// --- Type Definitions ---
interface Annotation {
  pageNumber: number;
  type: "HIGHLIGHT";
  boundingBox: [number, number, number, number];
  color: string;
  opacity: number;
}
interface ViewerAPIs {
  goToLocation: (page: number) => void;
  addAnnotations: (annotations: Annotation[]) => Promise<void>;
  getSelectedContent: () => Promise<{ text: string }>;
}
interface AdobeViewer {
  getAPIs: () => Promise<ViewerAPIs>;
}

type AdobeViewEnum = {
  CallbackType: {
    EVENT_LISTENER: string;
    GET_FEATURE_FLAG: string;
  };
  Events: {
    SELECTION_END: string;
  };
};

interface AdobeDCView {
  previewFile: (
    args: {
      content: { location: { url: string } } | { promise: Promise<ArrayBuffer> };
      metaData: { fileName: string; id?: string; hasReadOnlyAccess?: boolean };
    },
    viewerConfig: { 
      embedMode: 'SIZED_CONTAINER';
      enableSearchAPIs?: boolean;
      enableFormFillAPI?: boolean;
      enableAnnotationAPIs?: boolean;
      includePDFAnnotations?: boolean;
      showAnnotationTools?: boolean;
      showDownloadPDF?: boolean;
      showPrintPDF?: boolean;
      showLeftHandPanel?: boolean;
      showPageControls?: boolean;
      enableLinearization?: boolean;
    }
  ) => Promise<AdobeViewer>;
  registerCallback: (type: unknown, callback: (event: unknown) => void, options: unknown) => void;
}

type AdobeViewCtor = new (options: { clientId: string; divId: string }) => AdobeDCView;
type AdobeViewStatic = { Enum: AdobeViewEnum };
declare global {
  interface Window {
    AdobeDC?: { View?: (AdobeViewCtor & AdobeViewStatic) };
  }
}

// --- Component Props ---
interface PdfViewerProps {
  fileUrl: string | null;
  fileName: string;
  file?: File;
  annotations: Annotation[];
  onViewerReady: (apis: ViewerAPIs) => void;
  onTextSelect: (selectedText: string) => void;
}

export default function PdfViewer({ fileUrl, fileName, file, annotations, onViewerReady, onTextSelect }: PdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerApis, setViewerApis] = useState<ViewerAPIs | null>(null);
  const viewerApisRef = useRef<ViewerAPIs | null>(null);

  // Memoized callbacks passed from parent
  const onViewerReadyRef = useRef(onViewerReady);
  const onTextSelectRef = useRef(onTextSelect);
  useEffect(() => { onViewerReadyRef.current = onViewerReady; }, [onViewerReady]);
  useEffect(() => { onTextSelectRef.current = onTextSelect; }, [onTextSelect]);
  useEffect(() => { viewerApisRef.current = viewerApis; }, [viewerApis]);

  // Main effect to render PDF
  useEffect(() => {
    if (!file && !fileUrl) return;

    let isMounted = true;
    let adobeDCView: AdobeDCView | null = null;

    const renderPdf = () => {
      if (!isMounted || !viewerRef.current) return;
      viewerRef.current.innerHTML = "";
      
      adobeDCView = new window.AdobeDC!.View!({
        clientId: process.env.NEXT_PUBLIC_ADOBE_CLIENT_ID!,
        divId: viewerRef.current.id,
      });

      // Generate a unique file ID for Adobe PDF viewer
      const generateFileId = () => {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        return `pdf_${timestamp}_${randomStr}`;
      };

      const fileId = generateFileId();
      
      const previewArgs = file
        ? { 
            content: { promise: file.arrayBuffer() }, 
            metaData: { 
              fileName, 
              id: fileId
            } 
          }
        : { 
            content: { location: { url: fileUrl! } }, 
            metaData: { 
              fileName, 
              id: fileId
            } 
          };

      // Register callbacks on the adobeDCView instance
      try {
        const Enum = (window.AdobeDC!.View as AdobeViewCtor & AdobeViewStatic).Enum;
        const instance = adobeDCView;
        if (!instance) return;
        
        // Feature flag callback to properly handle all Adobe feature flags
        // Register this callback BEFORE previewFile
        try {
          instance.registerCallback(
            Enum.CallbackType.GET_FEATURE_FLAG,
            (data: unknown) => {
              const payload = data as { feature?: string; data?: string; callbackId?: string } | undefined;
              const feature = (payload && (payload.feature || payload.data)) ?? '';
              
              // SIMPLE: Just disable problematic flags, allow everything else
              const disabledFlags = [
                'enable-tools-multidoc',
                'edit-config',
                'enable-inline-organize',
                'enable-pdf-request-signatures',
                'DCWeb_edit_image_experiment'
              ];
              
              // Disable known problematic flags, allow everything else (including text selection)
              const result = !disabledFlags.includes(feature);
              console.log(`Feature flag '${feature}': ${result}`);
              return result;
            },
            {}
          );
        } catch (e) {
          console.warn("Failed to register GET_FEATURE_FLAG callback:", e);
        }

        instance.registerCallback(
          Enum.CallbackType.EVENT_LISTENER,
          (event: unknown) => {
            const evt = event as { type?: string; data?: unknown } | undefined;
            console.log('Adobe PDF Event received:', evt);
            
            // Listen for text selection events
            if (isMounted && (evt?.type === Enum.Events.SELECTION_END || evt?.type === 'PREVIEW_SELECTION_END')) {
              console.log('📝 Text selection detected, attempting to get content...');
              
              // Use a small delay to ensure selection is complete
              setTimeout(() => {
                viewerApisRef.current?.getSelectedContent().then(selection => {
                  const rawText = selection?.text || '';
                  const text = rawText.trim();
                  console.log('📋 Selected text extracted:', `"${text}"`);
                  
                  if (text.length > 0) {
                    onTextSelectRef.current(text);
                  } else {
                    console.warn('⚠️ No text found in selection');
                  }
                }).catch((error) => {
                  console.error('❌ Failed to get selected content:', error);
                });
              }, 100);
            }
          },
          { 
            events: [Enum.Events.SELECTION_END, 'PREVIEW_SELECTION_END'],
            enableFilePreviewEvents: true,
            listenOn: ['DOCUMENT_FRAGMENT', 'TEXT_SELECTION'] // Ensure we listen to text selection events
          }
        );
      } catch (e) {
        console.error("Failed to register selection callback:", e);
      }
      
      // Preview the file with MINIMAL configuration to ensure text selection works
      const instance = adobeDCView;
      if (!instance) return;
      
      console.log('🚀 Starting Adobe PDF preview with minimal config for text selection...');
      instance.previewFile(previewArgs, { 
        embedMode: 'SIZED_CONTAINER'
        // Minimal config - let Adobe handle defaults for text selection
      })
        .then(adobeViewer => {
          if (!isMounted) return;
          console.log('✅ Adobe PDF viewer loaded successfully');
          adobeViewer.getAPIs().then(apis => {
            console.log('🔧 Adobe PDF APIs available:', Object.keys(apis || {}));
            setViewerApis(apis); // Set state to trigger other effects
            onViewerReadyRef.current(apis); // Also call the callback ref
            
            // Test if getSelectedContent is available
            if (apis && typeof apis.getSelectedContent === 'function') {
              console.log('✅ Text selection API is available');
              
              // Add fallback selection detection using DOM events
              setTimeout(() => {
                const pdfContainer = viewerRef.current;
                if (pdfContainer) {
                  console.log('📝 Setting up fallback text selection listener...');
                  
                  const handleSelection = () => {
                    console.log('🖱️ Mouse selection detected, checking for text...');
                    setTimeout(() => {
                      apis.getSelectedContent().then(selection => {
                        const text = (selection?.text || '').trim();
                        console.log('📋 Fallback selection text:', `"${text}"`);
                        if (text.length > 0) {
                          onTextSelectRef.current(text);
                        }
                      }).catch(console.error);
                    }, 200);
                  };
                  
                  // Listen for mouseup events as fallback
                  pdfContainer.addEventListener('mouseup', handleSelection);
                  
                  // Clean up on unmount
                  return () => {
                    pdfContainer.removeEventListener('mouseup', handleSelection);
                  };
                }
              }, 1000);
              
            } else {
              console.warn('⚠️ Text selection API is NOT available');
            }
          }).catch(error => {
            console.error('❌ Failed to get Adobe PDF APIs:', error);
          });
        })
        .catch(error => console.error("Adobe SDK previewFile Error:", error));
    };

    if (window.AdobeDC?.View) renderPdf();
    else document.addEventListener("adobe_dc_view_sdk.ready", renderPdf);

    return () => { isMounted = false; document.removeEventListener("adobe_dc_view_sdk.ready", renderPdf); };
  }, [file, fileUrl, fileName]);

  // Effect to draw annotations
  useEffect(() => {
    if (viewerApis && annotations.length > 0) {
      viewerApis.addAnnotations(annotations)
        .catch(err => console.error("Error adding annotations:", err));
    }
  }, [viewerApis, annotations]);

  return <div id="adobe-pdf-viewer" ref={viewerRef} className="h-full w-full" />;
}