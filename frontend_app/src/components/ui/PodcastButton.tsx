'use client';

import { useState, useRef } from 'react';
import { apiClient } from '@/lib/api-client';

interface PodcastButtonProps {
  currentSection?: string;
  relatedContent?: string;
  insights?: unknown;
  disabled?: boolean;
}

export default function PodcastButton({ 
  currentSection, 
  relatedContent, 
  insights, 
  disabled = false 
}: PodcastButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleGeneratePodcast = async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const data = await apiClient.generatePodcast();
      // Backend returns { podcast_script: string }. For now, just show it as text audio placeholder.
      // In future, if backend returns audio, convert and play like before.
      const audioElement = new Audio();
      audioElement.addEventListener('ended', () => setIsPlaying(false));
      audioElement.addEventListener('error', () => {
        setError('Failed to play audio');
        setIsPlaying(false);
      });
      setAudio(audioElement);
      audioRef.current = audioElement;
      
    } catch (err) {
      console.error('Podcast generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate podcast');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayPause = () => {
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (!audio) return;
    
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
  };

  return (
    <div className="flex items-center space-x-2">
      {!audio ? (
        <button
          onClick={handleGeneratePodcast}
          disabled={disabled || isGenerating}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg flex items-center space-x-2 transition-colors"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Generating...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v6.114a4.369 4.369 0 00-1-.114 3 3 0 103 3V7.82l8-1.6v5.894A4.37 4.37 0 0015 12a3 3 0 103 3V3z" />
              </svg>
              <span>Podcast Mode</span>
            </>
          )}
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePlayPause}
            className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg transition-colors"
          >
            {isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          
          <button
            onClick={handleStop}
            className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
          </button>
          
          <button
            onClick={handleGeneratePodcast}
            disabled={isGenerating}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white text-sm px-3 py-1 rounded transition-colors"
          >
            Regenerate
          </button>
        </div>
      )}
      
      {error && (
        <div className="text-red-500 text-sm">{error}</div>
      )}
    </div>
  );
}
