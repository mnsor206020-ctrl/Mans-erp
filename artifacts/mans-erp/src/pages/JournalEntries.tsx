import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useListJournalEntries,
  useGetCurrentUser,
  useDeleteJournalEntry,
  useSubmitJournalEntry,
  useCopyJournalEntry,
  getListJournalEntriesQueryKey,
  getGetJournalEntryQueryKey,
} from "@workspace/api-client-react";
import { getApiErrorMessage, hasJournalPermission, jt, pickDescription, STATUS_STYLES } from "@/lib/journal-entry-ui";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Send,
  Copy,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

type JEStatus = "ALL" | "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "POSTED" | "LOCKED" | "REVERSED" | "VOIDED";


function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  return (
    <Badge variant="outline" className={`text-xs font-medium ${STATUS_STYLES[status] || ""}`}>
      {t(`je.status.${status}`) || status}
    </Badge>
  );
}

function formatNumber(n: number | string | undefined): string {
  if (n === undefined || n === null) return "—";
  const num = parseFloat(String(n));
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JournalEntries() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetCurrentUser();
  const canCreate = hasJournalPermission(currentUser, "create");
  const canUpdate = hasJournalPermission(currentUser, "update");
  const canDelete = hasJournalPermission(currentUser, "delete");

  const [activeStatus, setActiveStatus] = useState<JEStatus>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; number: string } | null>(null);
  const [submitTarget, setSubmitTarget] = useState<{ id: string; number: string } | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    clearTimeout((window as any)._jeSearchTimer);
    (window as any)._jeSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 400);
  }, []);

  const queryParams = {
    status: activeStatus === "ALL" ? undefined : activeStatus,
    type: typeFilter === "ALL" ? undefined : typeFilter,
    search: debouncedSearch || undefined,
    page: String(page),
    pageSize: String(pageSize),
  };

  const { data, isLoading, refetch } = useListJournalEntries(queryParams as any);
  const entries = (data as any)?.data ?? [];
  const total = (data as any)?.total ?? 0;
  const totalPages = (data as any)?.pageCount ?? 1;

  const deleteMutation = useDeleteJournalEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: jt(lang, "deleted") });
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: jt(lang, "error"), description: getApiErrorMessage(err, jt(lang, "actionFailed")), variant: "destructive" });
        setDeleteTarget(null);
      },
    },
  });

  const submitMutation = useSubmitJournalEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: jt(lang, "submitted") });
        if (submitTarget) queryClient.invalidateQueries({ queryKey: getGetJournalEntryQueryKey(submitTarget.id) });
        setSubmitTarget(null);
        queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: jt(lang, "error"), description: getApiErrorMessage(err, jt(lang, "actionFailed")), variant: "destructive" });
        setSubmitTarget(null);
      },
    },
  });

  const copyMutation = useCopyJournalEntry({
    mutation: {
      onSuccess: (newEntry: any) => {
        toast({ title: jt(lang, "copied"), description: newEntry.number });
        queryClient.invalidateQueries({ queryKey: getListJournalEntriesQueryKey() });
        navigate(`/journal-entries/${newEntry.id}`);
      },
      onError: (err: any) => {
        toast({ title: jt(lang, "error"), description: getApiErrorMessage(err, jt(lang, "actionFailed")), variant: "destructive" });
      },
    },
  });

  const tabs: { key: JEStatus; label: string }[] = [
    { key: "ALL", label: t("je.allStatus") },
    { key: "DRAFT", label: t("je.status.DRAFT") },
    { key: "UNDER_REVIEW", label: t("je.status.UNDER_REVIEW") },
    { key: "APPROVED", label: t("je.status.APPROVED") },
    { key: "POSTED", label: t("je.status.POSTED") },
    { key: "LOCKED", label: t("je.status.LOCKED") },
    { key: "REVERSED", label: t("je.status.REVERSED") },
  ];


  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            {t("je.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("je.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={jt(lang, "refresh")} aria-label={jt(lang, "refresh")}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {canCreate && <Link href="/journal-entries/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              {t("je.new")}
            </Button>
          </Link>}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-0 -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveStatus(tab.key); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap border-b-2 -mb-px ${
              activeStatus === tab.key
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("je.search")}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{jt(lang, "allTypes")}</SelectItem>
            <SelectItem value="MANUAL">{t("je.type.MANUAL")}</SelectItem>
            <SelectItem value="ADJUSTMENT">{t("je.type.ADJUSTMENT")}</SelectItem>
            <SelectItem value="OPENING">{t("je.type.OPENING")}</SelectItem>
            <SelectItem value="CLOSING">{t("je.type.CLOSING")}</SelectItem>
            <SelectItem value="AUTOMATIC">{t("je.type.AUTOMATIC")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("je.number")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("je.date")}</th>
                <th className="text-start font-semibold py-3 px-4">{t("je.description")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("je.type")}</th>
                <th className="text-end font-semibold py-3 px-4 whitespace-nowrap">{t("je.totalDebit")}</th>
                <th className="text-end font-semibold py-3 px-4 whitespace-nowrap">{t("je.totalCredit")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("je.linesCount")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("je.status")}</th>
                <th className="text-start font-semibold py-3 px-4 whitespace-nowrap">{t("je.createdBy")}</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{t("je.empty")}</p>
                    <p className="text-xs mt-1">{t("je.empty.desc")}</p>
                    {canCreate && <Link href="/journal-entries/new">
                      <Button className="mt-4 gap-2" size="sm">
                        <Plus className="w-4 h-4" />
                        {t("je.new")}
                      </Button>
                    </Link>}
                  </td>
                </tr>
              ) : (
                entries.map((entry: any) => {
                  const createdBy = entry.createdBy;
                  const createdByName = createdBy
                    ? `${createdBy.firstNameEn || ""} ${createdBy.lastNameEn || ""}`.trim() || createdBy.email
                    : "—";
                  const desc = pickDescription(entry, lang);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/journal-entries/${entry.id}`)}
                    >
                      <td className="py-3 px-4 font-mono font-medium text-primary whitespace-nowrap">
                        {entry.number}
                        {entry.isReversal && (
                          <span className="ms-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-sans">REV</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                        {entry.entryDate ? new Date(entry.entryDate).toLocaleDateString("en-SA") : "—"}
                      </td>
                      <td className="py-3 px-4 max-w-[200px] truncate text-muted-foreground">
                        {desc || <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground">{t(`je.type.${entry.type}`)}</span>
                      </td>
                      <td className="py-3 px-4 text-end font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                        {formatNumber(entry.totalDebit)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono tabular-nums text-blue-700 whitespace-nowrap">
                        {formatNumber(entry.totalCredit)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {entry._count?.lines ?? "—"}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={entry.status} />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground text-xs">
                        {createdByName}
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-8 h-8 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/journal-entries/${entry.id}`)}>
                              <Eye className="w-4 h-4 me-2" />
                              {jt(lang, "view")}
                            </DropdownMenuItem>
                            {canUpdate && entry.fiscalYear?.status === "OPEN" && ["DRAFT", "UNDER_REVIEW"].includes(entry.status) && (
                              <DropdownMenuItem onClick={() => navigate(`/journal-entries/${entry.id}/edit`)}>
                                <Pencil className="w-4 h-4 me-2" />
                                {t("je.edit")}
                              </DropdownMenuItem>
                            )}
                            {canUpdate && entry.fiscalYear?.status === "OPEN" && entry.status === "DRAFT" && (
                              <DropdownMenuItem onClick={() => setSubmitTarget({ id: entry.id, number: entry.number })}>
                                <Send className="w-4 h-4 me-2" />
                                {t("je.submit")}
                              </DropdownMenuItem>
                            )}
                            {canCreate && entry.fiscalYear?.status === "OPEN" && <DropdownMenuItem onClick={() => copyMutation.mutate({ id: entry.id, data: {} } as any)}>
                              <Copy className="w-4 h-4 me-2" />
                              {t("je.copy")}
                            </DropdownMenuItem>}
                            {canDelete && entry.fiscalYear?.status === "OPEN" && entry.status === "DRAFT" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget({ id: entry.id, number: entry.number })}
                                >
                                  <Trash2 className="w-4 h-4 me-2" />
                                  {t("je.delete")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-t bg-muted/20">
            <p className="text-sm text-muted-foreground">
              {jt(lang, "showing")} {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} {jt(lang, "of")} {total}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="w-8 h-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
              </Button>
              <span className="text-sm px-2">{page} / {totalPages}</span>
              <Button variant="ghost" size="icon" className="w-8 h-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("je.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("je.confirmDelete.desc")} ({deleteTarget?.number})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
            >
              {deleteMutation.isPending ? jt(lang, "processing") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit Confirm */}
      <AlertDialog open={!!submitTarget} onOpenChange={(o) => !o && setSubmitTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("je.submit")}</AlertDialogTitle>
            <AlertDialogDescription>
              {jt(lang, "submitConfirm")} ({submitTarget?.number})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => submitTarget && submitMutation.mutate({ id: submitTarget.id, data: {} } as any)}
            >
              {submitMutation.isPending ? jt(lang, "processing") : t("je.submit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
