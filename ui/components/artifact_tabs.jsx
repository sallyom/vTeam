import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Markdown } from "@llamaindex/chat-ui/widgets";
import { 
  FileText, 
  Workflow, 
  Building2, 
  ListChecks, 
  Edit3,
  Download,
  Copy,
  Check
} from "lucide-react";

const ARTIFACT_META = {
  rfe_description: {
    icon: FileText,
    title: "RFE Description",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Complete RFE specification"
  },
  feature_refinement: {
    icon: Workflow,
    title: "Feature Refinement",
    color: "bg-green-50 text-green-700 border-green-200", 
    description: "Detailed feature breakdown"
  },
  architecture: {
    icon: Building2,
    title: "Architecture",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    description: "System architecture design"
  },
  epics_stories: {
    icon: ListChecks,
    title: "Epics & Stories",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    description: "Development epics and user stories"
  }
};

function ArtifactTab({ artifactType, content, isActive, onEdit }) {
  const [copied, setCopied] = useState(false);
  const meta = ARTIFACT_META[artifactType] || ARTIFACT_META.rfe_description;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifactType.replace('_', '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg border", meta.color)}>
            <meta.icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{meta.title}</h3>
            <p className="text-xs text-gray-500">{meta.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-8"
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(artifactType)}
            className="h-8"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="prose prose-sm max-w-none">
          <Markdown content={content} />
        </div>
      </ScrollArea>
    </div>
  );
}

function RFEBuilderProgress({ event }) {
  if (!event) return null;

  const { phase, stage, description, artifact_type, progress, streaming_type } = event;
  
  const getPhaseColor = (phase) => {
    switch (phase) {
      case 'building': return 'bg-blue-100 text-blue-800';
      case 'generating': return 'bg-green-100 text-green-800';
      case 'editing': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStreamingIndicator = (type) => {
    if (!type) return null;
    
    return (
      <Badge variant="outline" className="ml-2 animate-pulse">
        {type === 'reasoning' ? '🧠 Thinking...' : '✍️ Writing...'}
      </Badge>
    );
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={getPhaseColor(phase)}>
              {phase.charAt(0).toUpperCase() + phase.slice(1)} Phase
            </Badge>
            {getStreamingIndicator(streaming_type)}
          </div>
          <Badge variant="secondary">{progress}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {stage.charAt(0).toUpperCase() + stage.slice(1)}
            {artifact_type && ` - ${ARTIFACT_META[artifact_type]?.title}`}
          </div>
          {description && (
            <div className="text-xs text-gray-600">{description}</div>
          )}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ArtifactTabs({ artifacts = {}, events = [], onEditArtifact }) {
  const [activeTab, setActiveTab] = useState(null);

  // Set default active tab when artifacts are available
  useEffect(() => {
    const artifactKeys = Object.keys(artifacts);
    if (artifactKeys.length > 0 && !activeTab) {
      setActiveTab(artifactKeys[0]);
    }
  }, [artifacts, activeTab]);

  // Get the latest progress event
  const latestProgressEvent = events
    .filter(e => e.type === 'rfe_builder_progress')
    .slice(-1)[0]?.data;

  const artifactCount = Object.keys(artifacts).length;
  const hasArtifacts = artifactCount > 0;

  if (!hasArtifacts && !latestProgressEvent) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No artifacts generated yet.</p>
          <p className="text-sm">Start a conversation to begin building your RFE!</p>
        </div>
      </div>
    );
  }

  if (latestProgressEvent && !hasArtifacts) {
    return (
      <div className="h-full p-4">
        <RFEBuilderProgress event={latestProgressEvent} />
        <div className="flex items-center justify-center flex-1 text-gray-500 mt-8">
          <div className="text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-300 animate-pulse" />
            <p>Building your RFE and artifacts...</p>
            <p className="text-sm">This may take a few minutes.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Progress indicator if still in progress */}
      {latestProgressEvent && latestProgressEvent.progress < 100 && (
        <div className="p-4 border-b">
          <RFEBuilderProgress event={latestProgressEvent} />
        </div>
      )}

      {/* Artifact tabs */}
      {hasArtifacts && (
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col"
        >
          <TabsList className="grid w-full grid-cols-4 h-12 p-1 m-4 mb-0">
            {Object.entries(artifacts).map(([key, content]) => {
              const meta = ARTIFACT_META[key] || ARTIFACT_META.rfe_description;
              return (
                <TabsTrigger 
                  key={key} 
                  value={key}
                  className="flex items-center gap-2 text-xs"
                >
                  <meta.icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{meta.title}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {Object.entries(artifacts).map(([key, content]) => (
            <TabsContent 
              key={key} 
              value={key}
              className="flex-1 m-4 mt-0"
            >
              <Card className="h-full">
                <ArtifactTab
                  artifactType={key}
                  content={content}
                  isActive={activeTab === key}
                  onEdit={onEditArtifact}
                />
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
