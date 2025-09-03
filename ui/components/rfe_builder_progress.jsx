import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { 
  Users, 
  Brain, 
  FileText, 
  Workflow,
  Building2, 
  ListChecks,
  CheckCircle, 
  Loader2,
  MessageSquare,
  Lightbulb,
  User,
  Settings,
  Code,
  Palette,
  Search,
  Target
} from "lucide-react";
import React, { useEffect, useState } from "react";

const PHASE_META = {
  building: {
    icon: MessageSquare,
    title: "Interactive Building",
    gradient: "from-blue-100 via-blue-50 to-white",
    iconBg: "bg-blue-100 text-blue-600",
    badge: "bg-blue-100 text-blue-700",
  },
  generating: {
    icon: FileText,
    title: "Generating Artifacts", 
    gradient: "from-green-100 via-green-50 to-white",
    iconBg: "bg-green-100 text-green-600",
    badge: "bg-green-100 text-green-700",
  },
  editing: {
    icon: CheckCircle,
    title: "Ready for Editing",
    gradient: "from-purple-100 via-purple-50 to-white", 
    iconBg: "bg-purple-100 text-purple-600",
    badge: "bg-purple-100 text-purple-700",
  },
};

const ARTIFACT_ICONS = {
  rfe_description: FileText,
  feature_refinement: Workflow,
  architecture: Building2,
  epics_stories: ListChecks,
};

const AGENT_ICONS = {
  PM: Target,
  PRODUCT_OWNER: User,
  ARCHITECT: Building2,
  BACKEND_ENG: Code,
  FRONTEND_ENG: Code,
  UXD: Palette,
  SME_RESEARCHER: Search,
};

function RFEBuilderProgressCard({ event }) {
  const [visible, setVisible] = useState(true);
  
  console.log("RFEBuilderProgressCard event:", event);
  
  useEffect(() => {
    if (event?.stage === "completed" && event?.progress === 100) {
      // Keep visible for editing phase
      setVisible(true);
    }
  }, [event]);

  if (!event || !visible) return null;

  const { phase, stage, description, artifact_type, progress, streaming_type } = event;
  const meta = PHASE_META[phase] || PHASE_META.building;
  const ArtifactIcon = artifact_type ? ARTIFACT_ICONS[artifact_type] : null;

  const getStageDisplay = () => {
    if (phase === 'building') {
      switch (stage) {
        case 'initializing':
          return {
            title: "Starting Session",
            subtitle: "Preparing interactive RFE building",
            showLoader: true
          };
        case 'collaborating':
          return {
            title: "Agent Collaboration",
            subtitle: "Working with AI agents to refine your idea",
            showLoader: true,
            streaming: streaming_type === 'reasoning'
          };
        case 'agent_analysis':
          return {
            title: event.agent_name ? `${event.agent_name} Analyzing` : "Agent Analysis",
            subtitle: event.agent_role ? `${event.agent_role} • ${description || "Analyzing RFE from specialized perspective"}` : (description || "Analyzing RFE requirements"),
            showLoader: true,
            streaming: streaming_type === 'reasoning',
            isAgent: true,
            agentPersona: event.agent_persona
          };
        case 'refining':
          return {
            title: "Refining RFE", 
            subtitle: "Incorporating insights and feedback",
            showLoader: true,
            streaming: streaming_type === 'writing'
          };
        case 'completed':
          return {
            title: "Building Complete",
            subtitle: "RFE is ready for artifact generation",
            showLoader: false
          };
        default:
          return {
            title: stage,
            subtitle: description,
            showLoader: true
          };
      }
    } else if (phase === 'generating') {
      switch (stage) {
        case 'researching':
          return {
            title: `Researching ${artifact_type ? ARTIFACT_ICONS[artifact_type]?.name || artifact_type : 'Content'}`,
            subtitle: "Analyzing requirements and gathering information",
            showLoader: true,
            streaming: true
          };
        case 'writing':
          return {
            title: `Writing ${artifact_type ? artifact_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Document'}`,
            subtitle: "Creating structured content",
            showLoader: true,
            streaming: true
          };
        default:
          return {
            title: "Generating Artifacts",
            subtitle: description,
            showLoader: true
          };
      }
    } else if (phase === 'editing') {
      return {
        title: "Ready for Edits",
        subtitle: "All artifacts generated! Chat to make changes.",
        showLoader: false
      };
    }

    return {
      title: stage,
      subtitle: description,
      showLoader: false
    };
  };

  const stageInfo = getStageDisplay();

  return (
    <div className="flex min-h-[200px] w-full items-center justify-center py-2">
      <Card
        className={cn(
          "w-full rounded-xl shadow-md transition-all duration-500",
          "border-0",
          `bg-gradient-to-br ${meta.gradient}`,
        )}
        style={{
          boxShadow:
            "0 2px 12px 0 rgba(80, 80, 120, 0.08), 0 1px 3px 0 rgba(80, 80, 120, 0.04)",
        }}
      >
        <CardHeader className="flex flex-row items-center gap-3 px-4 pb-2 pt-3">
          <div className={cn("flex items-center justify-center rounded-full p-2", meta.iconBg)}>
            <meta.icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              {meta.title}
              <Badge className={cn("ml-1", meta.badge, "px-2 py-0.5 text-xs")}>
                {progress}% Complete
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        
        <CardContent className="px-4 py-2">
          <div className="space-y-3">
            {/* Stage information */}
            <div className="flex items-start gap-3">
              {/* Show agent-specific icon if agent is working */}
              {stageInfo.isAgent && stageInfo.agentPersona && AGENT_ICONS[stageInfo.agentPersona] ? (
                <div className="mt-0.5">
                  <div className="flex items-center justify-center rounded-full p-1.5 bg-blue-50">
                    {React.createElement(AGENT_ICONS[stageInfo.agentPersona], {
                      className: "h-4 w-4 text-blue-600"
                    })}
                  </div>
                </div>
              ) : ArtifactIcon ? (
                <div className="mt-0.5">
                  <ArtifactIcon className="h-4 w-4 text-gray-500" />
                </div>
              ) : null}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-medium",
                    stageInfo.isAgent ? "text-blue-900" : "text-gray-900"
                  )}>
                    {stageInfo.title}
                  </span>
                  {stageInfo.showLoader && (
                    <Loader2 className={cn(
                      "h-3 w-3 animate-spin", 
                      stageInfo.isAgent ? "text-blue-400" : "text-gray-400"
                    )} />
                  )}
                  {stageInfo.streaming && (
                    <Badge variant="outline" className={cn(
                      "text-xs animate-pulse",
                      stageInfo.isAgent && "border-blue-200 text-blue-700"
                    )}>
                      {streaming_type === 'reasoning' ? '🧠 Thinking' : '✍️ Writing'}
                    </Badge>
                  )}
                </div>
                <div className={cn(
                  "text-xs mt-1",
                  stageInfo.isAgent ? "text-blue-600" : "text-gray-600"
                )}>
                  {stageInfo.subtitle}
                </div>
              </div>
            </div>

            {/* Progress indicator for building phase */}
            {phase === 'building' && stage === 'collaborating' && (
              <div className="flex items-center gap-2 py-1">
                <Brain className="h-3 w-3 text-blue-500" />
                <div className="flex-1">
                  <Skeleton className="h-2 w-3/4" />
                </div>
              </div>
            )}

            {/* Progress indicator for generation phase */}
            {phase === 'generating' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Artifact Progress</span>
                  <span className="font-medium">{Math.round((progress - 50) * 2)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, (progress - 50) * 2))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completion message */}
            {phase === 'editing' && (
              <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
                <Lightbulb className="h-4 w-4 text-purple-600" />
                <div className="text-sm text-purple-800">
                  Try saying: "Edit the architecture document to add more details about security"
                </div>
              </div>
            )}
          </div>
        </CardContent>

        {/* Overall progress bar */}
        <div className="px-4 pb-3 pt-1">
          <Progress
            value={progress}
            className="h-1.5 rounded-full bg-gray-200"
          />
        </div>
      </Card>
    </div>
  );
}

export default function Component({ events }) {
  const aggregateEvents = () => {
    if (!events || events.length === 0) return null;
    // Events are already the data objects from rfe_builder_progress events
    return events[events.length - 1];
  };

  const event = aggregateEvents();

  return <RFEBuilderProgressCard event={event} />;
}
