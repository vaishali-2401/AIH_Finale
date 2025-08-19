# Connecting the Dots - Frontend Application

**Adobe India Hackathon Grand Finals - Frontend Implementation**

An intelligent PDF reading experience frontend that displays PDFs and connects to a backend for AI-powered recommendations and insights. Built for the Adobe India Hackathon 2025 Grand Finals.

## 🎯 Architecture Overview

**Frontend-Only Implementation** - This repository contains only the frontend application. The backend with AI/LLM processing is implemented separately.

### Key Features:

- **Bulk PDF Upload** (up to 30 PDFs at once)
- **Document Library** with search and management
- **Adobe PDF Embed API** integration for high-fidelity PDF display
- **Smart Recommendations UI** with visual connection indicators
- **AI Insights Display** with contextual analysis
- **Podcast Mode** with audio controls
- **Performance Optimized** for <2 second navigation

## ✨ Core Components

### 📄 PDF Management

- **Bulk Upload Interface** - Drag & drop up to 30 PDFs simultaneously
- **Document Library** - Search, filter, and manage uploaded documents
- **Adobe PDF Embed API** - High-fidelity PDF rendering with zoom/pan support

### 🔗 Smart UI Features

- **Recommendations Sidebar** - Visual connection types (correlation, contradiction, elaboration, context)
- **Relevance Scoring** - Color-coded accuracy indicators (>80% accuracy)
- **Quick Navigation** - Click recommendations to jump with highlights
- **Context-Aware Display** - Visual indicators for different connection types

### 💡 AI Integration (Backend Connected)

- **Insights Panel** - Key takeaways, facts, and contradiction detection
- **Podcast Mode** - Audio overview generation with play/pause controls
- **Smart Recommendations** - LLM-powered content discovery

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Adobe PDF Embed API credentials
- Backend API running (your friend's implementation)

### Environment Setup

1. **Configure environment**

   ```bash
   cp sample.env .env.local
   # Edit .env.local with your configuration
   ```

2. **Key Environment Variables**

   ```bash
   # Adobe PDF Embed API
   NEXT_PUBLIC_ADOBE_CLIENT_ID=your_adobe_client_id

   # Google Gemini 2.5 Flash (for local testing only)
   GEMINI_API_KEY=your_gemini_key

   # Backend API URL
   NEXT_PUBLIC_BACKEND_API_URL=http://localhost:8000
   ```

### Local Development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start development server**
   ```bash
   npm run dev
   ```
3. **Open application**
   ```
   http://localhost:3000
   ```

### Production Build

1. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## 🏗️ Frontend Architecture

### Technology Stack

- **Next.js 15** with App Router
- **React 19** with TypeScript
- **Tailwind CSS** for styling
- **Adobe PDF Embed API** for PDF rendering

### Component Structure

```
src/
├── app/
│   └── (main)/page.tsx          # Main application page
├── components/
│   ├── upload/
│   │   └── BulkPdfUpload.tsx    # Bulk PDF upload interface
│   ├── library/
│   │   └── DocumentLibrary.tsx  # Document management
│   ├── pdf/
│   │   └── PdfViewer.tsx        # Adobe PDF integration
│   ├── layout/
│   │   ├── Sidebar.tsx          # Recommendations panel
│   │   └── RecommendationCard.tsx
│   └── ui/
│       ├── InsightsButton.tsx
│       ├── PodcastButton.tsx
│       └── LoadingSpinner.tsx
└── lib/
    ├── api-client.ts            # Backend API integration
    ├── cache.ts                 # Performance caching
    └── mock-data.ts             # Type definitions
```

## 🔌 Backend Integration

### API Endpoints Expected

The frontend expects the following backend endpoints:

#### 1. PDF Upload

```typescript
POST /api/pdfs/upload
Content-Type: multipart/form-data
Body: FormData with PDF files

Response: {
  success: boolean;
  uploadedFiles: string[];
  errors?: string[];
}
```

#### 2. Get Documents

```typescript
GET / api / documents;

Response: {
  id: string;
  name: string;
  uploadedAt: string;
}
[];
```

#### 3. Get Recommendations

```typescript
POST /api/recommendations
Content-Type: application/json
Body: {
  selectedText: string;
  documentContext?: string;
  currentPage?: number;
}

Response: {
  id: string;
  sourceDocument: string;
  snippet: string;
  pageNumber: number;
  boundingBox: [number, number, number, number];
  relevanceScore: number;
  connectionType: 'correlation' | 'contradiction' | 'elaboration' | 'context';
}[]
```

#### 4. Get Insights

```typescript
POST /api/insights
Content-Type: application/json
Body: {
  documentText: string;
}

Response: {
  keyTakeaways: string[];
  didYouKnow: string;
  contradiction: string | null;
}
```

#### 5. Generate Podcast

```typescript
POST /api/podcast
Content-Type: application/json
Body: {
  currentSection?: string;
  relatedContent?: string;
  insights?: BackendInsights;
}

Response: {
  script: string;
  audio: string; // Base64 encoded audio
  mimeType: string;
  duration: number;
}
```

## 🎯 UI/UX Features

### Three-View Interface

1. **Upload View** - Bulk PDF upload with drag & drop
2. **Library View** - Document management and selection
3. **Viewer View** - PDF display with AI features

### Smart Navigation

- **Tab-based navigation** between Upload/Library/Viewer
- **Breadcrumb navigation** with back buttons
- **Context preservation** - maintains state when switching views

### Performance Features

- **Caching** - 5-minute cache for API responses
- **Lazy loading** - Components load on demand
- **Optimized rendering** - Efficient PDF display
- **Error handling** - Graceful fallbacks and user feedback

## 🧪 Testing the Frontend

### Without Backend (Development)

The frontend includes fallback error messages when backend is not available:

- "Failed to load recommendations. Please check if backend is running."
- "Failed to fetch insights. Please check if backend is running."

### With Backend (Full Experience)

1. **Upload PDFs** - Drag & drop multiple files
2. **Browse Library** - Search and select documents
3. **View PDFs** - High-fidelity rendering with Adobe API
4. **Select Text** - Get AI-powered recommendations
5. **Generate Insights** - Context-aware analysis
6. **Podcast Mode** - Audio overview generation

## 📊 Evaluation Criteria Met

- ✅ **Adobe PDF Embed API** - Beautiful, high-fidelity PDF display
- ✅ **Bulk Upload** - Support for up to 30 PDFs simultaneously
- ✅ **Smart UI** - Visual connection indicators with >80% accuracy display
- ✅ **Fast Navigation** - Optimized for <2 second response times
- ✅ **Modern Interface** - Clean, responsive design with dark mode support
- ✅ **Error Handling** - Graceful degradation when backend unavailable
- ✅ **Performance** - Caching, lazy loading, and optimization

## 🔧 Configuration

### Adobe PDF Embed API Setup

1. Get credentials from Adobe Developer Console
2. Add `NEXT_PUBLIC_ADOBE_CLIENT_ID` to environment
3. Configure domain permissions in Adobe console

### Backend Integration

1. Update `NEXT_PUBLIC_BACKEND_API_URL` in environment
2. Ensure CORS is configured on backend
3. Verify all API endpoints match expected interfaces

## 📝 Frontend-Only Notes

This frontend is designed to work with a separately implemented backend. Key considerations:

1. **API Client** - Centralized in `src/lib/api-client.ts` for easy backend integration
2. **Type Safety** - Full TypeScript interfaces for all backend communication
3. **Error Handling** - Comprehensive error states and user feedback
4. **Caching** - Built-in performance optimization for API calls
5. **Fallbacks** - Graceful behavior when backend is unavailable

---

**Frontend Ready for Integration** - This implementation provides a complete, production-ready frontend that can be seamlessly integrated with your backend implementation.

Built with ❤️ for Adobe India Hackathon 2025
