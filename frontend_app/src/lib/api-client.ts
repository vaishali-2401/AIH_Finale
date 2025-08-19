// API Client for communicating with the backend
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

export interface BackendRecommendation {
  id: string;
  sourceDocument: string;
  snippet: string;
  pageNumber: number;
  boundingBox: [number, number, number, number];
  relevanceScore: number;
  connectionType: 'correlation' | 'contradiction' | 'elaboration' | 'context';
}

export interface BackendInsights {
  keyTakeaways: string[];
  didYouKnow: string;
  contradiction: string | null;
}

export interface BackendInsightResponse {
  insight: string;
}

export interface PodcastData {
  script: string;
  audio: string; // Base64 encoded audio
  mimeType: string;
  duration: number;
}

export interface DocumentInfo {
  id: string;
  name: string;
  uploadedAt: string;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  // Upload multiple PDFs to backend
  async uploadPDFs(files: File[]): Promise<{ message: string; files: string[] }> {
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch(`${this.baseUrl}/upload_pdfs`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('PDF upload error:', error);
      throw error;
    }
  }

  // Send screenshot and selected text to backend for text extraction and search
  async extractAndSearch(imageFile: File, selectedText: string): Promise<{ recommendations: BackendRecommendation[] }> {
    const formData = new FormData();
    formData.append('image', imageFile, imageFile.name);  // Added filename for proper identification
    formData.append('text', selectedText);

    try {
      const response = await fetch(`${this.baseUrl}/extract_and_search/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Extract and search failed: ${response.statusText}`);
      }

      const raw = await response.json();

      // If backend already returns recommendations, pass through
      if (Array.isArray(raw?.recommendations)) {
        return { recommendations: raw.recommendations as BackendRecommendation[] };
      }

      // Normalize Chroma-style search_results into recommendations expected by UI
      type ChromaResults = {
        documents?: string[][];
        metadatas?: Array<Array<Record<string, unknown>>>;
        ids?: string[][];
        distances?: number[][];
      };
      const searchResults: ChromaResults = (raw?.search_results ?? raw) as ChromaResults;
      const documents: string[] = Array.isArray(searchResults?.documents?.[0]) ? (searchResults!.documents![0] as string[]) : [];
      const metadatas: Array<Record<string, unknown>> = Array.isArray(searchResults?.metadatas?.[0]) ? (searchResults!.metadatas![0] as Array<Record<string, unknown>>) : [];
      const ids: string[] = Array.isArray(searchResults?.ids?.[0]) ? (searchResults!.ids![0] as string[]) : [];
      const distances: number[] = Array.isArray(searchResults?.distances?.[0]) ? (searchResults!.distances![0] as number[]) : [];

      const parsePageStart = (pageRange: unknown): number => {
        try {
          if (typeof pageRange === 'string') {
            const parsed = JSON.parse(pageRange.replace(/'/g, '"'));
            if (Array.isArray(parsed) && parsed.length > 0) return Number(parsed[0]) || 0;
          }
          if (Array.isArray(pageRange) && pageRange.length > 0) return Number(pageRange[0]) || 0;
        } catch {}
        return 0;
      };

      const parseFirstBBox = (bboxes: unknown): [number, number, number, number] => {
        try {
          let parsed: unknown = bboxes;
          if (typeof bboxes === 'string') parsed = JSON.parse(bboxes.replace(/'/g, '"')) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            const bb = (parsed as unknown[])[0];
            if (Array.isArray(bb) && bb.length === 4) {
              const nums = bb as Array<unknown>;
              return [Number(nums[0])||0, Number(nums[1])||0, Number(nums[2])||0, Number(nums[3])||0];
            }
          }
        } catch {}
        return [0, 0, 0, 0];
      };

      const recommendations: BackendRecommendation[] = documents.slice(0, 3).map((snippet, i) => {
        const meta = metadatas[i] || {};
        const pageStartZeroIndexed = parsePageStart(meta?.page_range);
        const pageNumber = (pageStartZeroIndexed ?? 0) + 1; // convert to 1-based for viewer
        const boundingBox = parseFirstBBox(meta?.chunk_bboxes);
        const relevance = distances?.[i];
        const relevanceScore = typeof relevance === 'number' ? 1 - Math.min(Math.max(relevance, 0), 1) : 0.8 - (i * 0.1);
        
        // Determine connection type based on relevance score and position
        let connectionType: 'correlation' | 'contradiction' | 'elaboration' | 'context' = 'context';
        if (relevanceScore > 0.8) connectionType = 'elaboration';
        else if (relevanceScore > 0.6) connectionType = 'correlation';
        else connectionType = 'context';
        
        return {
          id: (ids?.[i] as string) || `rec-${i}`,
          sourceDocument: String(meta?.document || meta?.sourceDocument || 'Unknown Document'),
          snippet: String(snippet || '').substring(0, 200) + (snippet.length > 200 ? '...' : ''), // Truncate for better display
          pageNumber,
          boundingBox,
          relevanceScore,
          connectionType,
        } as BackendRecommendation;
      });

      return { recommendations };
    } catch (error) {
      console.error('Extract and search error:', error);
      throw error;
    }
  }

  // Get insights from the backend
  async getInsights(): Promise<BackendInsightResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/generate_insights`, {
        method: 'GET',
      });

      if (!response.ok) {
        // Try to extract backend error detail for better UX
        try {
          const err = await response.json();
          const detail = (err && (err.detail || err.message || err.error)) ? (err.detail || err.message || err.error) : response.statusText;
          throw new Error(`Insights failed: ${detail}`);
        } catch {
          throw new Error(`Insights failed: ${response.statusText}`);
        }
      }

      return await response.json();
    } catch (error) {
      console.error('Insights error:', error);
      throw error;
    }
  }

  // Generate podcast script
  async generatePodcast(): Promise<{ podcast_script: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/generate_podcast`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Podcast generation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Podcast generation error:', error);
      throw error;
    }
  }

  // Get list of uploaded documents
  async getDocuments(): Promise<DocumentInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/list_pdfs`);

      if (!response.ok) {
        throw new Error(`Get documents failed: ${response.statusText}`);
      }

      const result = await response.json();
      // Normalize and ensure non-empty, unique IDs
      if (Array.isArray(result?.documents)) {
        return (result.documents as unknown[]).map((raw: unknown, index: number) => {
          const doc = (raw ?? {}) as { id?: string; name?: string; uploadedAt?: string };
          const baseId = (doc.id && String(doc.id).trim()) ? String(doc.id).trim() : '';
          const baseName = (doc.name && String(doc.name).trim()) ? String(doc.name).trim() : '';
          const fallbackId = `${(baseName || 'doc').replace('.pdf', '')}-${index}`;
          return {
            id: baseId || fallbackId,
            name: baseName,
            uploadedAt: doc.uploadedAt || new Date().toISOString(),
          } satisfies DocumentInfo;
        });
      }
      // Backwards-compatibility: handle { pdfs: [...] }
      if (Array.isArray(result?.pdfs)) {
        return (result.pdfs as unknown[]).map((raw: unknown, index: number) => {
          const doc = (raw ?? {}) as { id?: string; name?: string; filename?: string; uploadedAt?: string } | string;
          const asObj = (typeof doc === 'string') ? { filename: doc } : doc;
          const baseId = (asObj.id && String(asObj.id).trim()) ? String(asObj.id).trim() : '';
          const filename = (asObj.filename && String(asObj.filename).trim()) ? String(asObj.filename).trim() : '';
          const name = (asObj.name && String(asObj.name).trim()) ? String(asObj.name).trim() : filename;
          const fallbackId = `${(filename || name || 'doc').replace('.pdf', '')}-${index}`;
          return {
            id: baseId || fallbackId,
            name,
            uploadedAt: asObj.uploadedAt || new Date().toISOString(),
          } satisfies DocumentInfo;
        });
      }
      return [];
    } catch (error) {
      console.error('Get documents error:', error);
      throw error;
    }
  }

  // Get a specific PDF file
  async getPdf(filename: string): Promise<Blob> {
    try {
      const response = await fetch(`${this.baseUrl}/get_pdf/${filename}`);

      if (!response.ok) {
        throw new Error(`Get PDF failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Get PDF error:', error);
      throw error;
    }
  }

  // Helper to construct a direct PDF URL for embedding
  getPdfUrl(filename: string): string {
    return `${this.baseUrl}/get_pdf/${encodeURIComponent(filename)}`;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();