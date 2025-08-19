
import type { BackendRecommendation } from "@/lib/api-client";

interface RecommendationCardProps {
  recommendation: BackendRecommendation;
  onJumpToPage: (recommendation: BackendRecommendation) => void; // Function to handle the click
}

const getConnectionTypeIcon = (type: string) => {
  switch (type) {
    case 'correlation':
      return '🔗';
    case 'contradiction':
      return '⚠️';
    case 'elaboration':
      return '📖';
    case 'context':
      return '🔍';
    default:
      return '💡';
  }
};

const getConnectionTypeColor = (type: string) => {
  switch (type) {
    case 'correlation':
      return 'text-blue-600 dark:text-blue-400';
    case 'contradiction':
      return 'text-orange-600 dark:text-orange-400';
    case 'elaboration':
      return 'text-green-600 dark:text-green-400';
    case 'context':
      return 'text-purple-600 dark:text-purple-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
};

export default function RecommendationCard({ recommendation, onJumpToPage }: RecommendationCardProps) {
  const relevancePercent = Math.round(recommendation.relevanceScore * 100);
  
  return (
    <div
      onClick={() => onJumpToPage(recommendation)}
      className="p-4 mb-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-blue-50 hover:dark:bg-gray-700 transition-all hover:shadow-md"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{getConnectionTypeIcon(recommendation.connectionType)}</span>
          <span className={`text-xs font-medium uppercase tracking-wide ${getConnectionTypeColor(recommendation.connectionType)}`}>
            {recommendation.connectionType}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {relevancePercent}%
          </div>
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${relevancePercent}%` }}
            />
          </div>
        </div>
      </div>
      
      <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed mb-3">
        {recommendation.snippet}
      </p>
      
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          From: <span className="font-medium">{recommendation.sourceDocument}</span>
        </span>
        <span className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">
          Page {recommendation.pageNumber}
        </span>
      </div>
    </div>
  );
}