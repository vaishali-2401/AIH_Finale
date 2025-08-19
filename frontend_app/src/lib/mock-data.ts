// The format for a single coordinate quartet [x1, y1, x2, y2]
type BoundingBox = [number, number, number, number];

export interface Recommendation {
  id: string;
  sourceDocument: string;
  snippet: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  relevanceScore: number;
  connectionType: 'correlation' | 'contradiction' | 'elaboration' | 'context';
}

// Update our mock data with some sample coordinates
export const mockRecommendations: Recommendation[] = [
  {
    id: 'rec-1',
    sourceDocument: "Q1-Financials.pdf",
    snippet: "Despite a challenging quarter, the new 'Phoenix' project initiative saw a 15% increase in preliminary user engagement.",
    pageNumber: 1,
    boundingBox: [88, 552, 520, 564],
    relevanceScore: 0.92,
    connectionType: 'elaboration',
  },
  {
    id: 'rec-2',
    sourceDocument: "Market-Analysis.pdf",
    snippet: "User engagement metrics show strong correlation with project success rates across all verticals.",
    pageNumber: 3,
    boundingBox: [88, 300, 520, 320],
    relevanceScore: 0.88,
    connectionType: 'correlation',
  },
  {
    id: 'rec-3',
    sourceDocument: "Strategic-Overview.pdf",
    snippet: "However, preliminary data suggests caution when interpreting short-term engagement spikes.",
    pageNumber: 7,
    boundingBox: [88, 450, 520, 470],
    relevanceScore: 0.85,
    connectionType: 'contradiction',
  },
];