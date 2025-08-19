'use client';

import type { BackendRecommendation } from "@/lib/api-client";
import RecommendationCard from "./RecommendationCard";

interface SidebarProps {
  recommendations: BackendRecommendation[];
  isLoading: boolean;
  error: string | null;
  onJumpToPage: (recommendation: BackendRecommendation) => void;
}

const Loader = () => (
  <div className="flex justify-center items-center h-full">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
);

export default function Sidebar({ recommendations, isLoading, error, onJumpToPage }: SidebarProps) {
  const renderContent = () => {
    if (isLoading) {
      return <Loader />;
    }
    
    if (error) {
      return <p className="text-red-500 text-center p-4">{error}</p>;
    }

    // --- THIS IS THE FIX ---
    // First check if 'recommendations' exists, THEN check its length.
    if (!recommendations || recommendations.length === 0) {
      return <p className="text-gray-500 text-center p-4">Select text in the document to see related content.</p>;
    }

    return recommendations.map((rec, index) => (
      <RecommendationCard
        key={(rec.id && String(rec.id).trim()) ? rec.id : `${rec.sourceDocument}-${rec.pageNumber}-${index}`}
        recommendation={rec}
        onJumpToPage={onJumpToPage}
      />
    ));
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex-shrink-0">
        Connected Dots
      </h2>
      <div className="overflow-y-auto flex-grow relative">
        {renderContent()}
      </div>
    </div>
  );
}