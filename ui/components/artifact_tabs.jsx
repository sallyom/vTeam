import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { DocumentEditor, Markdown } from "@llamaindex/chat-ui/widgets";
import "@llamaindex/chat-ui/styles/editor.css";
import RFEBuilderProgressComponent from "./rfe_builder_progress";
import { 
  FileText, 
  Workflow, 
  Building2, 
  ListChecks, 
  Edit3,
  Download,
  Copy,
  Check,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Users,
  Brain,
  Loader2,
  MessageSquare,
  Lightbulb,
  User,
  Settings,
  Code,
  Palette,
  Search,
  Target,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff
} from "lucide-react";

// CSS for better DocumentEditor integration
const editorStyles = `
  .llamaindex-document-editor {
    height: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  
  .llamaindex-document-editor .toolbar {
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
    padding: 0.5rem;
  }
`;

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
  const [key, setKey] = useState(0);
  const [editedContent, setEditedContent] = useState(content);
  const [isEditing, setIsEditing] = useState(false);
  const meta = ARTIFACT_META[artifactType] || ARTIFACT_META.rfe_description;

  // Update edited content when content prop changes
  useEffect(() => {
    setEditedContent(content);
  }, [content]);

  // Force re-render of DocumentEditor component when tab becomes active
  useEffect(() => {
    if (isActive) {
      setKey(prev => prev + 1);
    }
  }, [isActive]);

  const handleCopy = async () => {
    try {
      const textToCopy = isEditing ? editedContent : content;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const contentToDownload = isEditing ? editedContent : content;
    const blob = new Blob([contentToDownload], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifactType.replace('_', '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleEdit = () => {
    if (isEditing) {
      // Save changes
      if (onEdit) {
        onEdit(artifactType, editedContent);
      }
      setIsEditing(false);
    } else {
      // Start editing
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setEditedContent(content);
    setIsEditing(false);
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
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 px-3 hover:bg-gray-100"
            title={copied ? "Copied!" : "Copy content"}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600 mr-1" />
            ) : (
              <Copy className="h-4 w-4 mr-1" />
            )}
            <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-8 px-3 hover:bg-gray-100"
            title="Download as markdown file"
          >
            <Download className="h-4 w-4 mr-1" />
            <span className="text-xs">Download</span>
          </Button>
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="h-8 px-3 hover:bg-gray-100 text-gray-600"
                title="Cancel editing"
              >
                <X className="h-4 w-4 mr-1" />
                <span className="text-xs">Cancel</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="h-8 px-3 hover:bg-gray-100 text-green-600 hover:text-green-700 hover:bg-green-50"
                title="Save changes"
              >
                <Check className="h-4 w-4 mr-1" />
                <span className="text-xs">Save</span>
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEdit}
              className="h-8 px-3 hover:bg-gray-100 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              title="Edit this document"
            >
              <Edit3 className="h-4 w-4 mr-1" />
              <span className="text-xs">Edit</span>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isEditing ? (
          <div className="h-full p-4">
            <DocumentEditor
              key={key}
              content={editedContent}
              onChange={setEditedContent}
              className="h-full"
            />
          </div>
        ) : (
          <ScrollArea className="h-full p-4">
            <div className="prose prose-sm max-w-none prose-pre:bg-gray-50 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
              <Markdown 
                content={content}
                className="markdown-content"
              />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

// Using enhanced RFEBuilderProgress component imported above
function RFEBuilderProgress({ event }) {
  // Convert single event to events array format expected by the component
  const events = event ? [event] : [];
  return <RFEBuilderProgressComponent events={events} />;
}

// Inline File Upload Component (using only supported imports)
function InlineFileUpload({ onFilesUploaded }) {
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelection = async (selectedFiles) => {
    const newFiles = [];
    
    for (const file of selectedFiles) {
      if (file.size > 10 * 1024 * 1024) continue; // 10MB limit
      
      newFiles.push({
        id: `${file.name}-${Date.now()}`,
        file,
        status: 'pending',
        progress: 0
      });
    }
    
    setFiles(prev => [...prev, ...newFiles]);
    await uploadFiles(newFiles);
  };

  const uploadFiles = async (filesToUpload) => {
    try {
      const fileIds = filesToUpload.map(f => f.id);
      setFiles(prev => prev.map(f => 
        fileIds.includes(f.id) ? { ...f, status: 'uploading', progress: 10 } : f
      ));

      // Convert files to base64
      const filesData = await Promise.all(
        filesToUpload.map(async (fileUpload) => {
          const reader = new FileReader();
          return new Promise((resolve) => {
            reader.onload = () => {
              const content = reader.result.split(',')[1]; // Remove data:mime;base64, prefix
              resolve({
                filename: fileUpload.file.name,
                content: content
              });
            };
            reader.readAsDataURL(fileUpload.file);
          });
        })
      );

      setFiles(prev => prev.map(f => 
        fileIds.includes(f.id) ? { ...f, progress: 50 } : f
      ));

      // Upload to workflow
      const response = await fetch("http://localhost:4501/file-upload-workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: filesData,
          user_id: "ui_user",
          context_description: "Documents uploaded via UI"
        })
      });

      if (response.ok) {
        setFiles(prev => prev.map(f => 
          fileIds.includes(f.id) ? { ...f, status: 'completed', progress: 100 } : f
        ));
        onFilesUploaded?.(filesToUpload.map(f => f.file));
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      const fileIds = filesToUpload.map(f => f.id);
      setFiles(prev => prev.map(f => 
        fileIds.includes(f.id) ? { ...f, status: 'error', error: error.message } : f
      ));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelection(Array.from(e.dataTransfer.files));
  };

  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">Drop files here or click to browse</p>
            <p className="text-sm text-gray-500">Supports: PDF, DOCX, TXT, MD (max 10MB each)</p>
            <Button variant="outline" className="mt-4">Choose Files</Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.doc"
            onChange={(e) => handleFileSelection(Array.from(e.target.files))}
            className="hidden"
          />
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Files ({files.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.map((fileUpload) => (
              <div key={fileUpload.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <FileText className="h-8 w-8 text-blue-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{fileUpload.file.name}</p>
                  <p className="text-xs text-gray-500">
                    {(fileUpload.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  {fileUpload.status === 'uploading' && (
                    <Progress value={fileUpload.progress} className="mt-1 h-1" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {fileUpload.status === 'pending' && <Badge variant="outline">Pending</Badge>}
                  {fileUpload.status === 'uploading' && (
                    <Badge variant="outline" className="animate-pulse">
                      Uploading... {fileUpload.progress}%
                    </Badge>
                  )}
                  {fileUpload.status === 'completed' && (
                    <Badge variant="outline" className="text-green-700 border-green-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Completed
                    </Badge>
                  )}
                  {fileUpload.status === 'error' && (
                    <Badge variant="outline" className="text-red-700 border-red-200">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Error
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(fileUpload.id)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ArtifactTabs({ artifacts = {}, events = [], onEditArtifact }) {
  const [activeTab, setActiveTab] = useState(null);
  const [showFileUpload, setShowFileUpload] = useState(false);

  // Debug artifacts structure (only log when artifacts change)
  // console.log("ArtifactTabs artifacts:", artifacts);

  // Inject CSS for better DocumentEditor styling
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = editorStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      // Cleanup
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
    };
  }, []);

  // Set default active tab when artifacts are available
  useEffect(() => {
    const artifactKeys = Object.keys(artifacts);
    if (artifactKeys.length > 0 && !activeTab) {
      setActiveTab(artifactKeys[0]);
      console.log("Setting active tab to:", artifactKeys[0]);
    }
  }, [artifacts, activeTab]);

  // Get the latest progress event
  // Events are already the data objects from rfe_builder_progress events
  const latestProgressEvent = events && events.length > 0 ? events[events.length - 1] : null;

  const artifactCount = Object.keys(artifacts).length;
  const hasArtifacts = artifactCount > 0;

  const handleFilesUploaded = (files) => {
    console.log('Files uploaded:', files);
    // Here you could trigger the RFE building process with the uploaded files
    // or show a success message
  };

  if (!hasArtifacts && !latestProgressEvent) {
    return (
      <div className="h-full p-4">
        {showFileUpload ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Upload Documents</h2>
              <Button 
                variant="outline" 
                onClick={() => setShowFileUpload(false)}
                className="text-sm"
              >
                Back to Chat
              </Button>
            </div>
            <InlineFileUpload 
              onFilesUploaded={handleFilesUploaded}
            />
            <div className="text-center text-sm text-gray-600 max-w-2xl mx-auto">
              <p>Upload relevant documents to help inform your RFE creation. Supported formats: PDF, DOCX, TXT, MD</p>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center space-y-6">
              <div>
                <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg">No artifacts generated yet.</p>
                <p className="text-sm text-gray-600">Start a conversation to begin building your RFE!</p>
              </div>
              
              <div className="flex flex-col gap-3 max-w-sm mx-auto">
                <Button 
                  onClick={() => setShowFileUpload(true)}
                  className="flex items-center gap-2"
                  variant="outline"
                >
                  <Upload className="h-4 w-4" />
                  Upload Documents
                </Button>
                <p className="text-xs text-gray-500">
                  Or upload documents to help inform your RFE creation
                </p>
              </div>
            </div>
          </div>
        )}
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
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Generated Artifacts</h2>
            <p className="text-sm text-gray-600">Each tab contains a separate document for your RFE</p>
          </div>
          
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col"
          >
          <TabsList className="grid w-full h-14 p-1 m-4 mb-2 bg-gray-100 rounded-lg border" style={{gridTemplateColumns: `repeat(${Object.keys(artifacts).length}, minmax(0, 1fr))`}}>
            {Object.entries(artifacts).map(([key, content]) => {
              const meta = ARTIFACT_META[key] || ARTIFACT_META.rfe_description;
              return (
                <TabsTrigger 
                  key={key} 
                  value={key}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all"
                >
                  <meta.icon className="h-4 w-4" />
                  <span className="truncate">{meta.title}</span>
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
        </div>
      )}
    </div>
  );
}
