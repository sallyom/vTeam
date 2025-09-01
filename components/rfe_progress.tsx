import { Markdown } from "@llamaindex/chat-ui/widgets";
import {
  AlertCircle,
  Brain,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  Network,
  Users,
  Zap,
} from "lucide-react";
import React, { useEffect, useState } from "react";

type EventData = {
  event:
    | "rfe_analysis"
    | "agent_consultation"
    | "synthesis"
    | "documentation"
    | "architecture"
    | "epics"
    | "completion";
  state: "pending" | "inprogress" | "done" | "error";
  persona?: string;
  progress?: number;
  message?: string;
  data?: any;
};

export default function RFEProgressComponent({
  events,
}: {
  events: EventData[];
}) {
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [agentProgress, setAgentProgress] = useState<
    Record<string, "pending" | "inprogress" | "done" | "error">
  >({});

  useEffect(() => {
    if (!events || events.length === 0) return;

    const latestEvent = events[events.length - 1];
    if (latestEvent.progress !== undefined) {
      setCurrentProgress(latestEvent.progress);
    }
    if (latestEvent.message) {
      setCurrentStep(latestEvent.message);
    }

    // Track agent progress
    if (latestEvent.event === "agent_consultation" && latestEvent.persona) {
      setAgentProgress((prev) => ({
        ...prev,
        [latestEvent.persona!]: latestEvent.state,
      }));
    }
  }, [events]);

  const getEventIcon = (eventType: EventData["event"]) => {
    switch (eventType) {
      case "rfe_analysis":
        return <FileText className="h-5 w-5" />;
      case "agent_consultation":
        return <Users className="h-5 w-5" />;
      case "synthesis":
        return <Brain className="h-5 w-5" />;
      case "documentation":
        return <FileText className="h-5 w-5" />;
      case "architecture":
        return <Network className="h-5 w-5" />;
      case "epics":
        return <Zap className="h-5 w-5" />;
      case "completion":
        return <CheckCircle className="h-5 w-5" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusIcon = (state: EventData["state"]) => {
    switch (state) {
      case "pending":
        return <Clock className="h-4 w-4 text-gray-400" />;
      case "inprogress":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "done":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getEventState = (eventType: EventData["event"]): EventData["state"] => {
    const relevantEvents = events.filter((e) => e.event === eventType);
    if (relevantEvents.length === 0) return "pending";

    const latestEvent = relevantEvents[relevantEvents.length - 1];
    return latestEvent.state;
  };

  const getEventTitle = (eventType: EventData["event"]): string => {
    switch (eventType) {
      case "rfe_analysis":
        return "RFE Analysis";
      case "agent_consultation":
        return "Expert Consultation";
      case "synthesis":
        return "Analysis Synthesis";
      case "documentation":
        return "Team Planning";
      case "architecture":
        return "Architecture Design";
      case "epics":
        return "Epic Creation";
      case "completion":
        return "Final Documentation";
      default:
        return "Processing";
    }
  };

  const getEventDescription = (eventType: EventData["event"]): string => {
    switch (eventType) {
      case "rfe_analysis":
        return "Initial analysis and understanding of the RFE requirements";
      case "agent_consultation":
        return "Multiple domain experts analyzing the requirements from their perspective";
      case "synthesis":
        return "Synthesizing insights from all expert consultations";
      case "documentation":
        return "Identifying component teams and responsibilities";
      case "architecture":
        return "Creating system architecture diagrams and specifications";
      case "epics":
        return "Breaking down into implementable epics and user stories";
      case "completion":
        return "Generating comprehensive feature documentation";
      default:
        return "Processing request";
    }
  };

  const eventTypes: EventData["event"][] = [
    "rfe_analysis",
    "agent_consultation",
    "synthesis",
    "documentation",
    "architecture",
    "epics",
    "completion",
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">RFE Refiner</h1>
        <p className="text-gray-600 mt-2">
          Multi-Agent Feature Refinement System
        </p>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Overall Progress
            </span>
            <span className="text-sm text-gray-600">{currentProgress}%</span>
          </div>
          {/* Custom Progress Bar */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${currentProgress}%` }}
            />
          </div>
          {currentStep && (
            <p className="text-sm text-blue-600 font-medium">{currentStep}</p>
          )}
        </div>
      </div>

      {/* Process Steps */}
      <div className="grid gap-4">
        {eventTypes.map((eventType, index) => {
          const state = getEventState(eventType);
          const isActive = state === "inprogress";
          const isComplete = state === "done";
          const hasError = state === "error";
          const isPending = state === "pending";

          return (
            <div
              key={eventType}
              className={`
                border-2 rounded-lg bg-white shadow-sm transition-all duration-300
                ${isActive ? "border-blue-500 shadow-lg shadow-blue-100" : ""}
                ${isComplete ? "border-green-500" : ""}
                ${hasError ? "border-red-500" : ""}
                ${isPending ? "border-gray-200 opacity-60" : ""}
              `}
            >
              <div className="flex flex-col space-y-1.5 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`
                        p-2 rounded-full
                        ${isActive ? "bg-blue-100" : ""}
                        ${isComplete ? "bg-green-100" : ""}
                        ${hasError ? "bg-red-100" : ""}
                        ${isPending ? "bg-gray-100" : ""}
                      `}
                    >
                      {getEventIcon(eventType)}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold leading-none tracking-tight">
                        {getEventTitle(eventType)}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {getEventDescription(eventType)}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`
                      inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold space-x-1
                      ${isActive ? "text-blue-500 border-blue-500" : ""}
                      ${isComplete ? "text-green-500 border-green-500" : ""}
                      ${hasError ? "text-red-500 border-red-500" : ""}
                      ${isPending ? "text-gray-500 border-gray-300" : ""}
                    `}
                  >
                    {getStatusIcon(state)}
                    <span className="capitalize">{state}</span>
                  </div>
                </div>
              </div>

              {/* Agent Progress for consultation phase */}
              {eventType === "agent_consultation" &&
                Object.keys(agentProgress).length > 0 && (
                  <div className="p-6 pt-0">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm text-gray-700 mb-3">
                        Expert Analysis Progress
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(agentProgress).map(
                          ([persona, agentState]) => (
                            <div
                              key={persona}
                              className="flex items-center space-x-2 p-2 rounded-md bg-gray-50"
                            >
                              {getStatusIcon(agentState as EventData["state"])}
                              <span className="text-xs text-gray-600 truncate">
                                {persona}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          );
        })}
      </div>

      {/* Results Summary (when complete) */}
      {getEventState("completion") === "done" && (
        <div className="border-green-500 border-2 rounded-lg bg-white shadow-sm">
          <div className="flex flex-col space-y-1.5 p-6">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <h3 className="text-xl font-semibold leading-none tracking-tight text-green-700">
                Feature Refinement Complete!
              </h3>
            </div>
            <p className="text-sm text-gray-600">
              Your RFE has been analyzed by our multi-agent system and
              comprehensive documentation has been generated.
            </p>
          </div>
          <div className="p-6 pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-semibold text-green-800">Documentation</h4>
                <p className="text-sm text-green-600">
                  Complete feature specification with requirements,
                  architecture, and implementation plan
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-blue-800">Architecture</h4>
                <p className="text-sm text-blue-600">
                  System architecture diagrams and technical specifications
                </p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <h4 className="font-semibold text-purple-800">
                  Implementation
                </h4>
                <p className="text-sm text-purple-600">
                  Epics, user stories, and development timeline
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
