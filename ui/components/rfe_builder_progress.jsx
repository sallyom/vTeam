import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { 
  FileText, 
  Workflow,
  Building2, 
  ListChecks,
  CheckCircle, 
  Loader2,
  MessageSquare,
  Lightbulb
} from "lucide-react";
import React from "react";

const PHASE_META = {
  building: {
    icon: MessageSquare,
    title: "Building RFE",
    gradient: "from-blue-100 via-blue-50 to-white",
    iconBg: "bg-blue-100 text-blue-600",
  },
  generating_phase_1: {
    icon: FileText,
    title: "Generating Phase 1", 
    gradient: "from-green-100 via-green-50 to-white",
    iconBg: "bg-green-100 text-green-600",
  },
  phase_1_ready: {
    icon: Lightbulb,
    title: "Phase 1 Ready",
    gradient: "from-purple-100 via-purple-50 to-white", 
    iconBg: "bg-purple-100 text-purple-600",
  },
  generating_phase_2: {
    icon: Building2,
    title: "Generating Phase 2", 
    gradient: "from-orange-100 via-orange-50 to-white",
    iconBg: "bg-orange-100 text-orange-600",
  },
  completed: {
    icon: CheckCircle,
    title: "All Phases Complete",
    gradient: "from-emerald-100 via-emerald-50 to-white", 
    iconBg: "bg-emerald-100 text-emerald-600",
  },
  // Legacy support
  generating: {
    icon: FileText,
    title: "Generating Artifacts", 
    gradient: "from-green-100 via-green-50 to-white",
    iconBg: "bg-green-100 text-green-600",
  },
  editing: {
    icon: CheckCircle,
    title: "Ready for Editing",
    gradient: "from-purple-100 via-purple-50 to-white", 
    iconBg: "bg-purple-100 text-purple-600",
  },
};

function SimpleProgressCard({ event }) {
  if (!event) return null;

  const { phase, stage, description } = event;
  const meta = PHASE_META[phase] || PHASE_META.building;

  return (
    <div className="w-full py-2">
      <Card className={cn(
        "rounded-xl shadow-md transition-all duration-500 border-0",
        `bg-gradient-to-br ${meta.gradient}`,
      )}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex items-center justify-center rounded-full p-2", meta.iconBg)}>
              <meta.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {meta.title}
                </span>
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {description || stage}
              </div>
            </div>
          </div>

          {/* Completion messages */}
          {(phase === 'editing' || phase === 'phase_1_ready') && (
            <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg mt-3">
              <Lightbulb className="h-4 w-4 text-purple-600" />
              <div className="text-sm text-purple-800">
                {phase === 'phase_1_ready' 
                  ? "Phase 1 complete! Chat to refine, or continue to Phase 2 for Architecture & Epics."
                  : "All artifacts ready! Chat to make changes."
                }
              </div>
            </div>
          )}

          {phase === 'completed' && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg mt-3">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <div className="text-sm text-emerald-800">
                All phases complete! Your RFE documents are ready.
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
  return <SimpleProgressCard event={event} />;
}
