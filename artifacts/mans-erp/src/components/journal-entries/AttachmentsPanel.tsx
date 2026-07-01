import { useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJournalEntryAttachments,
  useUploadJournalEntryAttachments,
  useDeleteJournalEntryAttachment,
  useUpdateJournalEntryAttachment,
  getJournalEntryAttachmentDownloadUrl,
  getListJournalEntryAttachmentsQueryKey,
  type JournalEntryAttachment,
} from "@workspace/api-client-react";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  File,
  FileText,
  FileSpreadsheet,
  Image,
  Upload,
  Download,
  Trash2,
  Star,
  Loader2,
  AlertCircle,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf")
    return <FileText className="h-5 w-5 shrink-0 text-red-500" />;
  if (mimeType.startsWith("image/"))
    return <Image className="h-5 w-5 shrink-0 text-blue-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileSpreadsheet className="h-5 w-5 shrink-0 text-green-600" />;
  return <File className="h-5 w-5 shrink-0 text-muted-foreground" />;
}

const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls";

// ─── Component ───────────────────────────────────────────────────────────────

interface AttachmentsPanelProps {
  journalEntryId: string;
  mode: "view" | "upload";
  className?: string;
}

export function AttachmentsPanel({
  journalEntryId,
  mode,
  className,
}: AttachmentsPanelProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: getListJournalEntryAttachmentsQueryKey(journalEntryId),
      }),
    [queryClient, journalEntryId],
  );

  // ── Queries & mutations ──────────────────────────────────────────────────

  const { data, isLoading, isError } =
    useListJournalEntryAttachments(journalEntryId);
  const attachments = (data?.data ?? []) as JournalEntryAttachment[];

  const uploadMutation = useUploadJournalEntryAttachments({
    mutation: {
      onSuccess: () => {
        toast({ title: t("je.attachments.uploaded") });
        invalidate();
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      onError: (e: unknown) =>
        toast({
          title: t("je.attachments.uploadError"),
          description: (e as { response?: { data?: { error?: string } } })
            ?.response?.data?.error,
          variant: "destructive",
        }),
    },
  });

  const deleteMutation = useDeleteJournalEntryAttachment({
    mutation: {
      onSuccess: () => {
        toast({ title: t("je.attachments.deleted") });
        invalidate();
      },
      onError: (e: unknown) =>
        toast({
          title: t("je.attachments.deleteError"),
          description: (e as { response?: { data?: { error?: string } } })
            ?.response?.data?.error,
          variant: "destructive",
        }),
    },
  });

  const updateMutation = useUpdateJournalEntryAttachment({
    mutation: {
      onSuccess: () => invalidate(),
      onError: (e: unknown) =>
        toast({
          title: t("common.error"),
          description: (e as { response?: { data?: { error?: string } } })
            ?.response?.data?.error,
          variant: "destructive",
        }),
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      uploadMutation.mutate({
        id: journalEntryId,
        data: { files: Array.from(files) as unknown as Blob[] },
      });
    },
    [journalEntryId, uploadMutation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDownload = useCallback(
    async (attachmentId: string) => {
      setDownloadingId(attachmentId);
      try {
        const result = await getJournalEntryAttachmentDownloadUrl(
          journalEntryId,
          attachmentId,
        );
        window.open(result.url, "_blank", "noopener,noreferrer");
      } catch {
        toast({ title: t("je.attachments.downloadError"), variant: "destructive" });
      } finally {
        setDownloadingId(null);
      }
    },
    [journalEntryId, t, toast],
  );

  const handleDelete = useCallback(
    (attachmentId: string) => {
      deleteMutation.mutate({ id: journalEntryId, attachmentId });
    },
    [journalEntryId, deleteMutation],
  );

  const handleSetPrimary = useCallback(
    (attachmentId: string, currentIsPrimary: boolean) => {
      updateMutation.mutate({
        id: journalEntryId,
        attachmentId,
        data: { isPrimary: !currentIsPrimary },
      });
    },
    [journalEntryId, updateMutation],
  );

  const isUploading = uploadMutation.isPending;
  const uploadMode = mode === "upload";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card className={cn(className)}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="h-4 w-4" />
            {t("je.attachments")}
            {!isLoading && attachments.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {attachments.length}
              </Badge>
            )}
          </CardTitle>

          {uploadMode && (
            <Button
              size="sm"
              variant="outline"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("je.attachments.uploading")}
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {t("je.attachments.upload")}
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Hidden file input */}
        {uploadMode && (
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        )}

        {/* ── Loading state ───────────────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        )}

        {/* ── Error state ─────────────────────────────────────────────── */}
        {isError && !isLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("je.attachments.error")}</AlertDescription>
          </Alert>
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {!isLoading && !isError && attachments.length === 0 && (
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 text-center transition-colors",
              uploadMode
                ? isDragging
                  ? "border-primary bg-primary/5"
                  : "cursor-pointer border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                : "border-muted-foreground/20",
            )}
            onClick={() => uploadMode && fileInputRef.current?.click()}
            onDrop={uploadMode ? handleDrop : undefined}
            onDragOver={uploadMode ? handleDragOver : undefined}
            onDragLeave={uploadMode ? handleDragLeave : undefined}
          >
            <div className="mb-3 rounded-full bg-muted p-3">
              <Paperclip className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {t("je.attachments.empty")}
            </p>
            {uploadMode && (
              <>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {t("je.attachments.empty.desc")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground/50">
                  {t("je.attachments.fileTypes")}
                </p>
                <p className="text-xs text-muted-foreground/50">
                  {t("je.attachments.maxFiles")}
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Populated state ─────────────────────────────────────────── */}
        {!isLoading && !isError && attachments.length > 0 && (
          <div
            className={cn(
              "space-y-2 rounded-lg transition-colors",
              uploadMode &&
                isDragging &&
                "outline outline-2 outline-primary/50 bg-primary/5",
            )}
            onDrop={uploadMode ? handleDrop : undefined}
            onDragOver={uploadMode ? handleDragOver : undefined}
            onDragLeave={uploadMode ? handleDragLeave : undefined}
          >
            {attachments.map((att) => (
              <AttachmentRow
                key={att.id}
                attachment={att}
                mode={mode}
                isDownloading={downloadingId === att.id}
                isUpdating={updateMutation.isPending}
                isDeleting={deleteMutation.isPending}
                onDownload={handleDownload}
                onSetPrimary={handleSetPrimary}
                onDelete={handleDelete}
                t={t}
              />
            ))}

            {/* Uploading in-progress row */}
            {isUploading && (
              <div className="flex items-center gap-3 rounded-md border border-dashed bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{t("je.attachments.uploading")}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Footer hint (populated upload mode) ─────────────────────── */}
        {uploadMode && !isLoading && !isError && attachments.length > 0 && (
          <p className="mt-3 text-center text-xs text-muted-foreground/60">
            {t("je.attachments.fileTypes")} · {t("je.attachments.maxFiles")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Attachment Row ──────────────────────────────────────────────────────────

interface AttachmentRowProps {
  attachment: JournalEntryAttachment;
  mode: "view" | "upload";
  isDownloading: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  onDownload: (id: string) => void;
  onSetPrimary: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
  t: (key: string) => string;
}

function AttachmentRow({
  attachment: att,
  mode,
  isDownloading,
  isUpdating,
  isDeleting,
  onDownload,
  onSetPrimary,
  onDelete,
  t,
}: AttachmentRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2.5 text-sm">
      {/* File type icon */}
      <FileTypeIcon mimeType={att.mimeType} />

      {/* File info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{att.fileName}</span>
          {att.isPrimary && (
            <Badge variant="default" className="h-4 shrink-0 px-1.5 text-[10px]">
              <Star className="mr-0.5 h-2.5 w-2.5" />
              {t("je.attachments.primary")}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{formatBytes(att.fileSizeBytes)}</span>
          <span aria-hidden>·</span>
          <span>{formatDateTime(att.createdAt)}</span>
          <span aria-hidden>·</span>
          <span>
            {t("je.attachments.uploadedBy")}{" "}
            <code className="font-mono">{att.uploadedByUserId.slice(0, 8)}</code>
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Download */}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title={t("je.attachments.download")}
          disabled={isDownloading}
          onClick={() => onDownload(att.id)}
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Set primary (upload mode) */}
        {mode === "upload" && (
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-7 w-7 transition-colors",
              att.isPrimary
                ? "text-yellow-500 hover:text-yellow-600"
                : "hover:text-yellow-500",
            )}
            title={t("je.attachments.setPrimary")}
            disabled={isUpdating}
            onClick={() => onSetPrimary(att.id, att.isPrimary)}
          >
            <Star className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* Delete (upload mode) */}
        {mode === "upload" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            title={t("je.attachments.delete")}
            disabled={isDeleting}
            onClick={() => onDelete(att.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
