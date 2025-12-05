"use client";

import { useState, useRef } from "react";
import { Loader2, Upload, Link, FileUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

type UploadFileModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadFile: (source: { type: 'local' | 'url', file?: File, url?: string, filename?: string }) => Promise<void>;
  isLoading?: boolean;
};

export function UploadFileModal({
  open,
  onOpenChange,
  onUploadFile,
  isLoading = false,
}: UploadFileModalProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'url'>('local');
  const [fileUrl, setFileUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (activeTab === 'local') {
      if (!selectedFile) return;
      await onUploadFile({ type: 'local', file: selectedFile });
    } else {
      if (!fileUrl.trim()) return;

      // Extract filename from URL
      const urlParts = fileUrl.split('/');
      const filename = urlParts[urlParts.length - 1] || 'downloaded-file';

      await onUploadFile({ type: 'url', url: fileUrl.trim(), filename });
    }

    // Reset form
    setFileUrl("");
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancel = () => {
    setFileUrl("");
    setSelectedFile(null);
    setUploadProgress(0);
    setActiveTab('local');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const isSubmitDisabled = () => {
    if (isLoading) return true;
    if (activeTab === 'local') return !selectedFile;
    if (activeTab === 'url') return !fileUrl.trim();
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Upload files to your workspace from your local machine or a URL.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'local' | 'url')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local">
              <FileUp className="h-4 w-4 mr-2" />
              Local File
            </TabsTrigger>
            <TabsTrigger value="url">
              <Link className="h-4 w-4 mr-2" />
              From URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-upload">Select File</Label>
              <Input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                onChange={handleFileSelect}
                disabled={isLoading}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Choose a file from your local machine to upload to /workspace
              </p>
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-url">File URL</Label>
              <Input
                id="file-url"
                placeholder="https://example.com/file.txt"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Enter the URL of a file to download and add to /workspace
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {isLoading && uploadProgress > 0 && (
          <div className="space-y-2">
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-sm text-center text-muted-foreground">
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
