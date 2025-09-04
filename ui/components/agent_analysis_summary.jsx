import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import React from "react";

function AgentAnalysisSummary({ events }) {
  const [summaryState, setSummaryState] = useState({
    status: null,
    message: null,
    summary: null
  });

  // Process events to update summary state
  useEffect(() => {
    events.forEach(event => {
        const { status, message, summary } = event;
        
        setSummaryState({
          status,
          message,
          summary: summary || null
        });
      
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

      {/* Summary Content */}
      {summaryState.summary && summaryState.status === 'complete' && (
        <div className="text-sm text-gray-800 whitespace-pre-wrap">
          {summaryState.summary}
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
