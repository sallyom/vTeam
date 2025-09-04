import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 
  Search, 
  Building2,
  ListChecks,
  CheckCircle,
  Loader2,
  ExternalLink,
  Users
} from "lucide-react";
import React from "react";

const STAGE_META = {
  analyzing: {
    icon: Search,
    title: "Analyzing RFE",
    gradient: "from-blue-100 via-blue-50 to-white",
    iconBg: "bg-blue-100 text-blue-600",
    description: "AI agents analyzing Jira RFE for implementation details..."
  },
  generating_architecture: {
    icon: Building2,
    title: "Generating Architecture", 
    gradient: "from-purple-100 via-purple-50 to-white",
    iconBg: "bg-purple-100 text-purple-600",
    description: "Creating detailed architecture document..."
  },
  generating_epics: {
    icon: ListChecks,
    title: "Generating Epics & Stories",
    gradient: "from-green-100 via-green-50 to-white",
    iconBg: "bg-green-100 text-green-600", 
    description: "Creating implementation epics and user stories..."
  },
  completed: {
    icon: CheckCircle,
    title: "Architecture & Epics Ready",
    gradient: "from-emerald-100 via-emerald-50 to-white",
    iconBg: "bg-emerald-100 text-emerald-600",
    description: "Implementation documents generated successfully!"
  },
};

function JiraRFEWorkflowProgress({ event }) {
  if (!event) return null;

  const { stage, rfe_key, description, progress = 0 } = event;
  const meta = STAGE_META[stage] || STAGE_META.analyzing;
  
  const isCompleted = stage === 'completed';
  const isInProgress = !isCompleted;

  return (
    <div className="w-full py-2">
      <Card className={cn(
        "rounded-xl shadow-md transition-all duration-500 border-0",
        `bg-gradient-to-br ${meta.gradient}`,
      )}>
        <CardContent className="p-4">
          {/* Header with RFE Key */}
          {rfe_key && (
            <div className="flex items-center gap-2 mb-3">
              <ExternalLink className="h-4 w-4 text-gray-500" />
              <Badge variant="outline" className="text-xs font-mono">
                {rfe_key}
              </Badge>
              <span className="text-xs text-gray-600">Jira RFE</span>
            </div>
          )}

          {/* Main Status */}
          <div className="flex items-center gap-3">
            <div className={cn("flex items-center justify-center rounded-full p-2", meta.iconBg)}>
              {isInProgress ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <meta.icon className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {meta.title}
                </span>
                {isInProgress && (
                  <span className="text-xs text-gray-500">
                    {progress}%
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {description || meta.description}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {isInProgress && progress > 0 && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    stage === 'analyzing' ? "bg-blue-500" :
                    stage === 'generating_architecture' ? "bg-purple-500" :
                    stage === 'generating_epics' ? "bg-green-500" : "bg-gray-500"
                  )}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Agent Analysis Indicator */}
          {stage === 'analyzing' && (
            <div className="flex items-center gap-2 p-2 bg-blue-50/80 rounded-lg mt-3">
              <Users className="h-4 w-4 text-blue-600" />
              <div className="text-xs text-blue-800">
                AI agents (Backend, Frontend, Architect, UX) analyzing RFE...
              </div>
            </div>
          )}

          {/* Completion Message */}
          {isCompleted && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg mt-3">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <div className="text-sm text-emerald-800">
                Architecture and implementation documents are ready for review and iteration.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Component({ events }) {
  const event = events && events.length > 0 ? events[events.length - 1] : null;
  return <JiraRFEWorkflowProgress event={event} />;
}
