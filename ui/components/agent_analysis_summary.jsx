import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import React from "react";

function AgentAnalysisSummary({ events }) {
  const [summaryState, setSummaryState] = useState({
    status: null,
    message: null,
    summary: null,
    timestamp: null
  });

  // Process events to update summary state, keeping the latest timestamp
  useEffect(() => {
    // Sort events by timestamp if available
    const sortedEvents = events.sort((a, b) => {
      const timestampA = a.timestamp || 0;
      const timestampB = b.timestamp || 0;
      return timestampA - timestampB;
    });

    // Process events in chronological order
    sortedEvents.forEach(event => {
        const { status, message, summary, timestamp } = event;
        
        setSummaryState(prev => ({
          status,
          message,
          summary: summary || prev.summary, // Keep existing summary if not provided
          timestamp: timestamp || prev.timestamp
        }));
    });
  }, [events]);

  // Don't render if no summary events have occurred
  if (!summaryState.status) return null;

  return (
    <div className="w-full py-2">
      {/* Loading State */}
      {summaryState.status === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{summaryState.message || "Analyzing agent insights..."}</span>
        </div>
      )}

      {/* Summary Content - Streaming or Complete */}
      {summaryState.summary && (summaryState.status === 'streaming' || summaryState.status === 'complete') && (
        <div className="prose prose-sm max-w-none">
          <div 
            className={`text-sm text-gray-800 ${summaryState.status === 'streaming' ? 'opacity-80' : ''}`}
            dangerouslySetInnerHTML={{
              __html: summaryState.summary
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/^- (.*)$/gm, '• $1')
                .replace(/^### (.*)$/gm, '<h3 class="font-semibold text-base mt-4 mb-2 text-gray-900">$1</h3>')
                .replace(/^## (.*)$/gm, '<h2 class="font-semibold text-lg mt-4 mb-2 text-gray-900">$1</h2>')
                .replace(/^# (.*)$/gm, '<h1 class="font-bold text-xl mt-4 mb-2 text-gray-900">$1</h1>')
                .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
                .replace(/\n\n/g, '<br><br>')
                .replace(/\n/g, '<br>')
            }}
          />
          {summaryState.status === 'streaming' && (
            <div className="flex items-center gap-2 mt-2">
              <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              <span className="text-xs text-gray-500">Generating...</span>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {summaryState.status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>{summaryState.message || "Failed to generate summary"}</span>
        </div>
      )}
    </div>
  );
}

export default AgentAnalysisSummary;
