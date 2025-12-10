"use client";

import { useState, useRef } from "react";
import { Loader2, Link, FileUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

type UploadFileModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadFile: (source: {
    type: "local" | "url";
    file?: File;
    url?: string;
    filename?: string;
  }) => Promise<void>;
  isLoading?: boolean;
};

export function UploadFileModal({
  open,
  onOpenChange,
  onUploadFile,
  isLoading = false,
}: UploadFileModalProps) {
  const [activeTab, setActiveTab] = useState<"local" | "url">("local");
  const [fileUrl, setFileUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isStartingService, setIsStartingService] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    setIsStartingService(false);

    if (activeTab === "local") {
      if (!selectedFile) return;
      try {
        await onUploadFile({ type: "local", file: selectedFile });
      } catch (error) {
        // Check if error is about content service starting
        if (error instanceof Error && error.message.includes("starting")) {
          setIsStartingService(true);
        }
        throw error;
      }
    } else {
      if (!fileUrl.trim()) return;

      // Extract filename from URL
      const urlParts = fileUrl.split("/");
      const filename = urlParts[urlParts.length - 1] || "downloaded-file";

      try {
        await onUploadFile({ type: "url", url: fileUrl.trim(), filename });
      } catch (error) {
        // Check if error is about content service starting
        if (error instanceof Error && error.message.includes("starting")) {
          setIsStartingService(true);
        }
        throw error;
      }
    }

    // Reset form on success
    setFileUrl("");
    setSelectedFile(null);
    setIsStartingService(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCancel = () => {
    setFileUrl("");
    setSelectedFile(null);
    setIsStartingService(false);
    setActiveTab("local");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
    if (activeTab === "local") return !selectedFile;
    if (activeTab === "url") return !fileUrl.trim();
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upload File</DialogTitle>
          <DialogDescription>
            Upload files to your workspace from your local machine or a URL. Files will be available in
            the file-uploads folder.
          </DialogDescription>
        </DialogHeader>

        {isStartingService && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Content service is starting. This may take a few seconds. Your upload will automatically retry.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "local" | "url")} className="w-full">
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
              <Label htmlFor="file-upload">Choose File</Label>
              <Input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                disabled={isLoading}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file-url">File URL</Label>
              <Input
                id="file-url"
                type="url"
                placeholder="https://example.com/file.pdf"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-sm text-muted-foreground">
                The file will be downloaded and uploaded to your workspace
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitDisabled()}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
