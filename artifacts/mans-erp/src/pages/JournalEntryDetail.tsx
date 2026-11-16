import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useGetJournalEntry,
  useGetCurrentUser,
  useSubmitJournalEntry,
  useApproveJournalEntry,
  useRejectJournalEntry,
  usePostJournalEntry,
  useReverseJournalEntry,
  useCopyJournalEntry,
  useVoidJournalEntry,
  useDeleteJournalEntry,
  getListJournalEntriesQueryKey,
  getGetJournalEntryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText,
  ChevronLeft,
  Pencil,
  Send,
  CheckCircle,
  XCircle,
  Bookmark,
  Lock,
  RotateCcw,
  Copy,
  Trash2,
  Ban,
  ArrowRight,
  User,
  Calendar,
  AlertTriangle,
  Link2,
} from "lucide-react";
import ApprovalTimeline from "@/components/journal-entries/ApprovalTimeline";
import IntegrityBadge from "@/components/journal-entries/IntegrityBadge";
import { AttachmentsPanel } from "@/components/journal-entries/AttachmentsPanel";
import { BalanceSummary } from "@/components/journal-entries/BalanceSummary";
import { getApiErrorMessage, getEntryActions, hasJournalPermission, jt, pickDescription, STATUS_STYLES } from "@/lib/journal-entry-ui";

const ACTION_ICONS: Record<string, any> = {
  SUBMIT:  Send,
  APPROVE: CheckCircle,
  REJECT:  XCircle,
  POST:    Bookmark,
  LOCK:    Lock,
  REVERSE: RotateCcw,
  VOID:    Ban,
};

function formatNumber(n: number | string | undefined): string {
  if (n === undefined || n === null) return "—";
  const num = parseFloat(String(n));
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-SA", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface Props {
  params: { id: string };
}

export default function JournalEntryDetail({ params }: Props) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();

  const [commentDialog, setCommentDialog] = useState<{ action: string; title: string } | null>(null);
  const [comment, setComment] = useState("");
  const [reverseDialog, setReverseDialog] = useState(false);
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().split("T")[0]);
  const [reverseReason, setReverseReason] = useState("");
  const [voidDialog, setVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(false);

  const { data: entry, isLoading, error } = useGetJournalEntry(params.id);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetJournalEntryQueryKey(params.id) });
  };
  const onErr = (e: unknown) => toast({ title: jt(lang, "error"), description: getApiErrorMessage(e, jt(lang, "actionFailed")), variant: "destructive" });

  const submitMutation = useSubmitJournalEntry({ mutation: {
    onSuccess: () => { toast({ title: jt(lang, "submitted") }); setCommentDialog(null); setComment(""); invalidate(); },
    onError: onErr,
  }});

  const approveMutation = useApproveJournalEntry({ mutation: {
    onSuccess: () => { toast({ title: jt(lang, "approved") }); setCommentDialog(null); setComment(""); invalidate(); },
    onError: onErr,
  }});

  const rejectMutation = useRejectJournalEntry({ mutation: {
    onSuccess: () => { toast({ title: jt(lang, "rejected") }); setCommentDialog(null); setComment(""); invalidate(); },
    onError: onErr,
  }});

  const postMutation = usePostJournalEntry({ mutation: {
    onSuccess: () => { toast({ title: jt(lang, "posted") }); invalidate(); },
    onError: onErr,
  }});

  const reverseMutation = useReverseJournalEntry({ mutation: {
    onSuccess: (rev: any) => {
      toast({ title: jt(lang, "reversalCreated"), description: rev.number });
      setReverseDialog(false);
      invalidate();
      navigate(`/journal-entries/${rev.id}`);
    },
    onError: onErr,
  }});

  const copyMutation = useCopyJournalEntry({ mutation: {
    onSuccess: (copy: any) => {
      toast({ title: jt(lang, "copied"), description: copy.number });
      invalidate();
      navigate(`/journal-entries/${copy.id}`);
    },
    onError: onErr,
  }});

  const voidMutation = useVoidJournalEntry({ mutation: {
    onSuccess: () => { toast({ title: jt(lang, "voided") }); setVoidDialog(false); setVoidReason(""); invalidate(); },
    onError: onErr,
  }});

  const deleteMutation = useDeleteJournalEntry({ mutation: {
    onSuccess: () => { toast({ title: jt(lang, "deleted") }); queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() }); navigate("/journal-entries"); },
    onError: onErr,
  }});

  const handleCommentAction = () => {
    if (!commentDialog) return;
    const action = commentDialog.action;
    if (action === "SUBMIT")  submitMutation.mutate({ id: params.id, data: { comment } } as any);
    if (action === "APPROVE") approveMutation.mutate({ id: params.id, data: { comment } } as any);
    if (action === "REJECT")  rejectMutation.mutate({ id: params.id, data: { comment } } as any);
  };

  const isBusy = submitMutation.isPending || approveMutation.isPending || rejectMutation.isPending
    || postMutation.isPending || reverseMutation.isPending
    || copyMutation.isPending || voidMutation.isPending || deleteMutation.isPending;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-destructive opacity-60" />
          <p className="font-medium">{jt(lang, "loadFailed")}</p>
          <Link href="/journal-entries">
            <Button variant="outline" className="mt-4 gap-2" size="sm">
              <ChevronLeft className="w-4 h-4" />
              {jt(lang, "back")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const e = entry as any;
  const status: string = e.status;
  const lines: any[] = e.lines ?? [];
  const approvals: any[] = e.approvals ?? [];
  const totalDebit = parseFloat(String(e.totalDebit || 0));
  const totalCredit = parseFloat(String(e.totalCredit || 0));
    const desc = pickDescription(e, lang);

  const actions = getEntryActions(status, e.reversedByEntryId);
  const canEdit = actions.canEdit && hasJournalPermission(currentUser, "update");
  const canSubmit = actions.canSubmit && hasJournalPermission(currentUser, "update");
  const canApprove = actions.canApprove && hasJournalPermission(currentUser, "approve");
  const canReject = actions.canReject && hasJournalPermission(currentUser, "approve");
  const canPost = actions.canPost && hasJournalPermission(currentUser, "approve");
  const canReverse = actions.canReverse && hasJournalPermission(currentUser, "void");
  const canVoid = actions.canVoid && hasJournalPermission(currentUser, "void");
  const canDelete = actions.canDelete && hasJournalPermission(currentUser, "delete");

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/journal-entries">
          <span className="hover:text-foreground cursor-pointer transition-colors">{t("je.title")}</span>
        </Link>
        <ChevronLeft className="w-4 h-4 rotate-180" />
        <span className="font-medium text-foreground font-mono">{e.number}</span>
      </div>

      {/* Header Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold font-mono tracking-tight">{e.number}</h1>
                <Badge variant="outline" className={`text-sm font-medium ${STATUS_STYLES[status] || ""}`}>
                  {t(`je.status.${status}`)}
                </Badge>
                {e.isReversal && (
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                    {t("je.isReversal")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{desc || <span className="italic">{jt(lang, "noDescription")}</span>}</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {hasJournalPermission(currentUser, "create") && <Button variant="outline" size="sm" className="gap-2" onClick={() => copyMutation.mutate({ id: e.id, data: {} } as any)} disabled={isBusy}>
                <Copy className="w-4 h-4" />
                {t("je.copy")}
              </Button>}
              {canEdit && (
                <Link href={`/journal-entries/${e.id}/edit`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Pencil className="w-4 h-4" />
                    {t("je.edit")}
                  </Button>
                </Link>
              )}
              {canSubmit && (
                <Button size="sm" className="gap-2" onClick={() => setCommentDialog({ action: "SUBMIT", title: t("je.submit") })} disabled={isBusy}>
                  <Send className="w-4 h-4" />
                  {t("je.submit")}
                </Button>
              )}
              {canApprove && (
                <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setCommentDialog({ action: "APPROVE", title: t("je.approve") })} disabled={isBusy}>
                  <CheckCircle className="w-4 h-4" />
                  {t("je.approve")}
                </Button>
              )}
              {canReject && (
                <Button size="sm" variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setCommentDialog({ action: "REJECT", title: t("je.reject") })} disabled={isBusy}>
                  <XCircle className="w-4 h-4" />
                  {t("je.reject")}
                </Button>
              )}
              {canPost && (
                <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => postMutation.mutate({ id: e.id } as any)} disabled={isBusy}>
                  <Bookmark className="w-4 h-4" />
                  {t("je.post")}
                </Button>
              )}
              {canReverse && (
                <Button size="sm" variant="outline" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setReverseDialog(true)} disabled={isBusy}>
                  <RotateCcw className="w-4 h-4" />
                  {t("je.reverse")}
                </Button>
              )}
              {canVoid && (
                <Button size="sm" variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-50" onClick={() => setVoidDialog(true)} disabled={isBusy}>
                  <Ban className="w-4 h-4" />
                  {t("je.void")}
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-50" onClick={() => setDeleteDialog(true)} disabled={isBusy}>
                  <Trash2 className="w-4 h-4" />
                  {t("je.delete")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Info Grid */}
        <Card className="md:col-span-2">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("je.date")}</p>
                <p className="font-medium">{formatDate(e.entryDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("je.type")}</p>
                <p className="font-medium">{t(`je.type.${e.type}`)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("je.fiscalYear")}</p>
                <p className="font-medium">{e.fiscalYear?.nameEn || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("je.currency")}</p>
                <p className="font-medium">{e.currencyCode}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("je.exchangeRate")}</p>
                <p className="font-medium">{parseFloat(e.exchangeRate).toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("je.reference")}</p>
                <p className="font-medium">{e.reference || "—"}</p>
              </div>
              {e.descriptionEn && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-muted-foreground mb-1">{t("je.descriptionEn")}</p>
                  <p className="font-medium">{e.descriptionEn}</p>
                </div>
              )}
              {e.descriptionAr && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-muted-foreground mb-1">{t("je.descriptionAr")}</p>
                  <p className="font-medium" dir="rtl">{e.descriptionAr}</p>
                </div>
              )}
            </div>

            {/* Reversal Links */}
            {e.reversalOf && (
              <div className="mt-4 p-3 rounded-lg bg-orange-50 border border-orange-200 flex items-center gap-2 text-sm text-orange-700">
                <RotateCcw className="w-4 h-4 flex-shrink-0" />
                <span>{t("je.reversalOf")}:</span>
                <Link href={`/journal-entries/${e.reversalOf.id}`}>
                  <span className="font-mono font-medium hover:underline cursor-pointer">{e.reversalOf.number}</span>
                </Link>
              </div>
            )}
            {e.reversals?.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-orange-50 border border-orange-200 flex items-center gap-2 text-sm text-orange-700">
                <RotateCcw className="w-4 h-4 flex-shrink-0" />
                <span>{t("je.reversedBy")}:</span>
                {e.reversals.map((r: any) => (
                  <Link key={r.id} href={`/journal-entries/${r.id}`}>
                    <span className="font-mono font-medium hover:underline cursor-pointer">{r.number}</span>
                  </Link>
                ))}
              </div>
            )}

            {/* Source Tracking */}
            {(e.sourceType || e.sourceReference || e.sourceModuleUrl) && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  {t("je.source.section")}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {e.sourceType && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t("je.source.type")}</p>
                      <p className="text-sm font-medium">
                        {t(`je.source.type.${e.sourceType}`) || e.sourceType}
                      </p>
                    </div>
                  )}
                  {e.sourceReference && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t("je.source.reference")}</p>
                      <p className="text-sm font-medium font-mono">{e.sourceReference}</p>
                    </div>
                  )}
                  {e.sourceModuleUrl && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t("je.source.moduleUrl")}</p>
                      <Link href={e.sourceModuleUrl}>
                        <span className="inline-flex items-center gap-1 text-sm text-primary hover:underline cursor-pointer font-mono">
                          <Link2 className="h-3 w-3 shrink-0" />
                          {e.sourceModuleUrl}
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workflow Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{jt(lang, "workflow")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {e.createdBy && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t("je.createdBy")}</p>
                <p className="text-sm font-medium">{`${e.createdBy.firstNameEn || ""} ${e.createdBy.lastNameEn || ""}`.trim() || e.createdBy.email}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
              </div>
            )}
            {e.submittedBy && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t("je.submittedBy")}</p>
                <p className="text-sm font-medium">{`${e.submittedBy.firstNameEn || ""} ${e.submittedBy.lastNameEn || ""}`.trim() || e.submittedBy.email}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.submittedAt)}</p>
              </div>
            )}
            {e.approvedBy && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t("je.approvedBy")}</p>
                <p className="text-sm font-medium">{`${e.approvedBy.firstNameEn || ""} ${e.approvedBy.lastNameEn || ""}`.trim() || e.approvedBy.email}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.approvedAt)}</p>
              </div>
            )}
            {e.postedBy && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">{t("je.postedBy")}</p>
                <p className="text-sm font-medium">{`${e.postedBy.firstNameEn || ""} ${e.postedBy.lastNameEn || ""}`.trim() || e.postedBy.email}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.postedAt)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Journal Lines */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{t("je.lines")}</span>
                      </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-start font-semibold py-2.5 px-4 w-8">#</th>
                  <th className="text-start font-semibold py-2.5 px-4">{t("je.account")}</th>
                  <th className="text-start font-semibold py-2.5 px-4">{t("je.description")}</th>
                  <th className="text-start font-semibold py-2.5 px-4">{t("je.costCenter")}</th>
                  <th className="text-end font-semibold py-2.5 px-4">{t("je.debit")}</th>
                  <th className="text-end font-semibold py-2.5 px-4">{t("je.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const lineDebit  = parseFloat(String(line.debit  || 0));
                  const lineCredit = parseFloat(String(line.credit || 0));
                  const lineDesc = lang === "ar" ? (line.descriptionAr || line.descriptionEn) : (line.descriptionEn || line.descriptionAr);
                  return (
                    <tr key={line.id} className={`border-b ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="py-2.5 px-4 text-muted-foreground">{line.lineNumber}</td>
                      <td className="py-2.5 px-4">
                        <span className="font-mono text-xs text-muted-foreground me-1.5">{line.account?.code}</span>
                        <span className="font-medium">{lang === "ar" ? (line.account?.nameAr || line.account?.nameEn) : (line.account?.nameEn || line.account?.nameAr)}</span>
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs">{lineDesc || "—"}</td>
                      <td className="py-2.5 px-4 text-muted-foreground text-xs">{line.costCenter ? `${line.costCenter.code} — ${lang === "ar" ? line.costCenter.nameAr : line.costCenter.nameEn}` : "—"}</td>
                      <td className="py-2.5 px-4 text-end font-mono tabular-nums text-emerald-700">
                        {lineDebit > 0 ? formatNumber(lineDebit) : ""}
                      </td>
                      <td className="py-2.5 px-4 text-end font-mono tabular-nums text-blue-700">
                        {lineCredit > 0 ? formatNumber(lineCredit) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
          <div className="p-3 sm:p-4 border-t">
            <BalanceSummary totalDebit={totalDebit} totalCredit={totalCredit} currencyCode={e.currencyCode} />
          </div>
        </CardContent>
      </Card>

      {/* Attachments */}
      <AttachmentsPanel journalEntryId={e.id} mode="view" />

      {/* Integrity Hash */}
      {e.integrityHash && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("je.hash.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <IntegrityBadge
              entryId={e.id}
              integrityHash={e.integrityHash}
              hashAlgorithm={e.hashAlgorithm}
              hashedAt={e.hashedAt}
            />
          </CardContent>
        </Card>
      )}

      {/* Approval History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("je.approvalHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ApprovalTimeline approvals={approvals} />
        </CardContent>
      </Card>

      {/* Comment Dialog (Submit / Approve / Reject) */}
      <Dialog open={!!commentDialog} onOpenChange={(o) => !o && setCommentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{commentDialog?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="comment">{t("je.comment")}</Label>
              <Textarea
                id="comment"
                placeholder={commentDialog?.action === "REJECT" ? t("je.rejectComment") : t("je.comment")}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleCommentAction} disabled={isBusy}>
              {isBusy ? jt(lang, "processing") : commentDialog?.title}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse Dialog */}
      <Dialog open={reverseDialog} onOpenChange={(o) => !o && setReverseDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("je.reverse")} — {e.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reverseDate">{t("je.reverseDate")}</Label>
              <Input id="reverseDate" type="date" value={reverseDate} onChange={(ev) => setReverseDate(ev.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="reverseReason">{t("je.reverseReason")}</Label>
              <Textarea id="reverseReason" value={reverseReason} onChange={(ev) => setReverseReason(ev.target.value)} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseDialog(false)}>{t("common.cancel")}</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => reverseMutation.mutate({ id: e.id, data: { reverseDate, reason: reverseReason } } as any)}
              disabled={reverseMutation.isPending}
            >
              {reverseMutation.isPending ? jt(lang, "processing") : t("je.reverse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <Dialog open={voidDialog} onOpenChange={(o) => !o && setVoidDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("je.void")} — {e.number}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("je.confirmVoid.desc")}</p>
          <div>
            <Label htmlFor="voidReason">{t("je.voidReason")} *</Label>
            <Textarea id="voidReason" value={voidReason} onChange={(ev) => setVoidReason(ev.target.value)} className="mt-1" rows={2} required />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialog(false)}>{t("common.cancel")}</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => voidMutation.mutate({ id: e.id, data: { reason: voidReason } } as any)}
              disabled={voidMutation.isPending || !voidReason.trim()}
            >
              {voidMutation.isPending ? jt(lang, "processing") : t("je.void")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteDialog} onOpenChange={(o) => !o && setDeleteDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("je.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("je.confirmDelete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: e.id })}
            >
              {deleteMutation.isPending ? jt(lang, "processing") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
