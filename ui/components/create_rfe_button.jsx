import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 
  ExternalLink,
  CheckCircle2,
  FileText,
  Lightbulb,
  Clock,
  Target
} from "lucide-react";
import React, { useState } from "react";

function CreateRFEButton({ event, onCreateRFE }) {
  const [isCreating, setIsCreating] = useState(false);
  
  if (!event) return null;

  const {
    message = "Ready to create RFE in Jira?",
    artifacts = [],
    rfe_content = "",
    refinement_content = ""
  } = event;

  const handleCreateRFE = async () => {
    setIsCreating(true);
    try {
      if (onCreateRFE) {
        await onCreateRFE({
          rfe_content,
          refinement_content
        });
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full py-4">
      <Card className="rounded-xl shadow-lg border-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-full p-2 bg-indigo-100 text-indigo-600">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg text-gray-900">
                RFE Documents Ready
              </CardTitle>
              <p className="text-sm text-gray-600">
                {message}
              </p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Artifacts Summary */}
          {artifacts.length > 0 && (
            <div className="bg-white/60 rounded-lg p-4 border border-white/40">
              <h4 className="text-sm font-medium text-gray-800 mb-3">
                ✅ Completed Documents:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {artifacts.map((artifact, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-white/80 rounded-md">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-gray-700 font-medium">
                      {artifact.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Information Note */}
          <div className="flex items-start gap-3 p-3 bg-blue-50/80 rounded-lg border border-blue-200/50">
            <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">What happens next?</p>
              <p>Creating the RFE will submit your refined documents to Jira. You can then use the separate Architecture Workflow to generate detailed technical designs and implementation plans.</p>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center pt-2">
            <Button
              onClick={handleCreateRFE}
              disabled={isCreating}
              size="lg"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg min-w-[200px]"
            >
              {isCreating ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Creating RFE...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Create RFE in Jira
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Component({ events, onCreateRFE }) {
  // Get the most recent create_rfe_ready event
  const event = events && events.length > 0 
    ? events.find(e => e.type === 'create_rfe_ready') || events[events.length - 1]
    : null;

  return <CreateRFEButton event={event} onCreateRFE={onCreateRFE} />;
}
