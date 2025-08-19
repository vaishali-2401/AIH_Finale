'use client';

interface InsightsButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

export default function InsightsButton({ onClick, isLoading }: InsightsButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="ml-4 p-2 rounded-full bg-yellow-300 text-yellow-900 hover:bg-yellow-400 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      aria-label="Get insights"
    >
      {isLoading ? (
        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M11 3a1 1 0 100 2h.01a1 1 0 100-2H11zM10.707 5.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 13.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-3.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      )}
    </button>
  );
}