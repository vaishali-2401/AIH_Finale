/**
 * Utility functions for capturing screenshots of selected text in PDFs
 */

export interface ScreenshotOptions {
  quality?: number;
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
  width?: number;
  height?: number;
}

/**
 * Captures a screenshot of the current viewport
 */
export async function captureViewportScreenshot(
  element: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<File> {
  const {
    quality = 0.8,
    format = 'image/jpeg',
    width = element.scrollWidth,
    height = element.scrollHeight
  } = options;

  try {
    // Use html2canvas if available, otherwise fallback to basic screenshot
    if (typeof window !== 'undefined' && (window as any).html2canvas) {
      return await captureWithHtml2Canvas(element, { quality, format, width, height });
    } else {
      return await captureBasicScreenshot(element, { quality, format, width, height });
    }
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    throw new Error('Failed to capture screenshot');
  }
}

/**
 * Captures screenshot using html2canvas library
 */
async function captureWithHtml2Canvas(
  element: HTMLElement,
  options: ScreenshotOptions
): Promise<File> {
  const { html2canvas } = await import('html2canvas');
  
  const canvas = await html2canvas(element, {
    useCORS: true,
    allowTaint: true,
    scale: 1,
    width: options.width,
    height: options.height,
    backgroundColor: '#ffffff'
  });

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `screenshot_${Date.now()}.jpg`, {
            type: 'image/jpeg'
          });
          resolve(file);
        }
      },
      options.format,
      options.quality
    );
  });
}

/**
 * Basic screenshot capture using canvas API
 */
async function captureBasicScreenshot(
  element: HTMLElement,
  options: ScreenshotOptions
): Promise<File> {
  return new Promise((resolve, reject) => {
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    // Set canvas dimensions
    canvas.width = options.width || element.scrollWidth;
    canvas.height = options.height || element.scrollHeight;

    // Create an image from the element's HTML
    const data = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${element.outerHTML}
        </div>
      </foreignObject>
    </svg>`;

    const img = new Image();
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        // Draw the image to canvas
        ctx.drawImage(img, 0, 0);
        
        // Convert to blob and then to file
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const file = new File([blob], `screenshot_${Date.now()}.jpg`, {
                type: 'image/jpeg'
              });
              resolve(file);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          options.format,
          options.quality
        );
        
        URL.revokeObjectURL(url);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Captures a screenshot of a specific text selection area
 * This is a simplified version that captures the entire viewport
 * In a real implementation, you'd want to capture just the selected area
 */
export async function captureTextSelectionScreenshot(
  pdfViewerElement: HTMLElement,
  selectedText: string,
  options: ScreenshotOptions = {}
): Promise<File> {
  // For now, capture the entire viewport
  // In the future, this could be enhanced to capture just the selected text area
  // by using the bounding box coordinates from the text selection
  
  console.log('Capturing screenshot for selected text:', selectedText);
  
  return captureViewportScreenshot(pdfViewerElement, {
    quality: 0.9,
    format: 'image/jpeg',
    ...options
  });
}

/**
 * Alternative method: Capture screenshot using browser's native screenshot API
 * This requires user permission and may not work in all browsers
 */
export async function captureNativeScreenshot(): Promise<File | null> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    console.warn('Native screenshot API not available');
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { mediaSource: 'screen' }
    });

    const track = stream.getVideoTracks()[0];
    const imageCapture = new (window as any).ImageCapture(track);
    
    const blob = await imageCapture.takePhoto();
    track.stop();
    
    return new File([blob], `screenshot_${Date.now()}.jpg`, {
      type: 'image/jpeg'
    });
  } catch (error) {
    console.error('Native screenshot failed:', error);
    return null;
  }
}



