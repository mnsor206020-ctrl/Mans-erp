import { useState, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import { useToast } from "@/hooks/use-toast";
import {
  useGetChartOfAccountsTree,
  useCreateChartOfAccount,
  useUpdateChartOfAccount,
  useDeleteChartOfAccount,
  useToggleChartOfAccountActive,
  getGetChartOfAccountsTreeQueryKey,
} from "@workspace/api-client-react";
import type { ChartOfAccountNode, CreateChartOfAccountInput, UpdateChartOfAccountInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronsDownUp,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
type AccountNature = "DEBIT" | "CREDIT";

interface AccountFormData {
  parentId: string | null;
  code: string;
  nameEn: string;
  nameAr: string;
  type: AccountType | "";
  nature: AccountNature | "";
  isGroup: boolean;
  notes: string;
}

const DEFAULT_FORM: AccountFormData = {
  parentId: null,
  code: "",
  nameEn: "",
  nameAr: "",
  type: "",
  nature: "",
  isGroup: false,
  notes: "",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<AccountType, { label: string; labelAr: string; color: string; dot: string }> = {
  ASSET:     { label: "Asset",     labelAr: "أصول",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",    dot: "bg-blue-500" },
  LIABILITY: { label: "Liability", labelAr: "التزامات",      color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",       dot: "bg-red-500" },
  EQUITY:    { label: "Equity",    labelAr: "حقوق الملكية",  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
  REVENUE:   { label: "Revenue",   labelAr: "إيرادات",       color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  EXPENSE:   { label: "Expense",   labelAr: "مصروفات",       color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",  dot: "bg-orange-500" },
};

function defaultNature(type: AccountType | ""): AccountNature | "" {
  if (!type) return "";
  return ["ASSET", "EXPENSE"].includes(type) ? "DEBIT" : "CREDIT";
}

function flattenTree(nodes: ChartOfAccountNode[]): ChartOfAccountNode[] {
  const out: ChartOfAccountNode[] = [];
  const walk = (n: ChartOfAccountNode) => {
    out.push(n);
    (n.children || []).forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

// ── AccountFormDialog ────────────────────────────────────────────────────────

interface AccountFormDialogProps {
  open: boolean;
  onClose: () => void;
  initialData?: AccountFormData & { id?: string };
  allAccounts: ChartOfAccountNode[];
  onSubmit: (data: AccountFormData) => void;
  isLoading: boolean;
  title: string;
}

function AccountFormDialog({
  open,
  onClose,
  initialData,
  allAccounts,
  onSubmit,
  isLoading,
  title,
}: AccountFormDialogProps) {
  const { lang, dir, t } = useLanguage();
  const [form, setForm] = useState<AccountFormData>(initialData || DEFAULT_FORM);

  const setField = <K extends keyof AccountFormData>(key: K, val: AccountFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "type") {
        next.nature = defaultNature(val as AccountType | "") as AccountNature | "";
      }
      return next;
    });
  };

  // Reset form when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (!o) onClose();
    else setForm(initialData || DEFAULT_FORM);
  };

  // Suggest next code based on parent
  const suggestedCode = useMemo(() => {
    if (!form.parentId) return "";
    const parent = allAccounts.find((a) => a.id === form.parentId);
    if (!parent) return "";
    const siblings = allAccounts.filter((a) => a.parentId === form.parentId);
    if (siblings.length === 0) return parent.code + "10";
    const nums = siblings.map((s) => parseInt(s.code.replace(/\D/g, "") || "0")).filter(Boolean);
    if (!nums.length) return "";
    const max = Math.max(...nums);
    return String(max + 10);
  }, [form.parentId, allAccounts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  // Filter out self from parent options
  const parentOptions = allAccounts.filter((a) => a.id !== initialData?.id);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir={dir}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Parent account */}
          <div className="space-y-1.5">
            <Label>{t("coa.parent")}</Label>
            <Select
              value={form.parentId ?? "__none__"}
              onValueChange={(v) => setField("parentId", v === "__none__" ? null : v)}
            >
              <SelectTrigger data-testid="select-parent">
                <SelectValue placeholder={t("coa.parent.none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("coa.parent.none")}</SelectItem>
                {parentOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs text-muted-foreground ltr:mr-2 rtl:ml-2">{a.code}</span>
                    {lang === "ar" ? a.nameAr : a.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Code */}
          <div className="space-y-1.5">
            <Label htmlFor="code">
              {t("coa.code")}
              {suggestedCode && !form.code && (
                <button
                  type="button"
                  className="ltr:ml-2 rtl:mr-2 text-xs text-primary underline"
                  onClick={() => setField("code", suggestedCode)}
                >
                  {t("coa.nextCode.hint")}: {suggestedCode}
                </button>
              )}
            </Label>
            <Input
              id="code"
              data-testid="input-code"
              value={form.code}
              onChange={(e) => setField("code", e.target.value)}
              placeholder="e.g. 1110"
              required
              maxLength={20}
              className="font-mono"
            />
          </div>

          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nameEn">{t("coa.nameEn")}</Label>
              <Input
                id="nameEn"
                data-testid="input-name-en"
                value={form.nameEn}
                onChange={(e) => setField("nameEn", e.target.value)}
                placeholder="Cash on Hand"
                required
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nameAr">{t("coa.nameAr")}</Label>
              <Input
                id="nameAr"
                data-testid="input-name-ar"
                value={form.nameAr}
                onChange={(e) => setField("nameAr", e.target.value)}
                placeholder="النقدية بالصندوق"
                required
                dir="rtl"
              />
            </div>
          </div>

          {/* Type + Nature */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("coa.type")}</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setField("type", v as AccountType)}
              >
                <SelectTrigger data-testid="select-type">
                  <SelectValue placeholder={t("coa.filter.all")} />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_CONFIG) as AccountType[]).map((t_) => (
                    <SelectItem key={t_} value={t_}>
                      <span className={cn("inline-block w-2 h-2 rounded-full ltr:mr-2 rtl:ml-2", TYPE_CONFIG[t_].dot)} />
                      {lang === "ar" ? TYPE_CONFIG[t_].labelAr : TYPE_CONFIG[t_].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("coa.nature")}
                <span className="ltr:ml-1 rtl:mr-1 text-xs text-muted-foreground">({t("coa.nature.auto")})</span>
              </Label>
              <Select
                value={form.nature}
                onValueChange={(v) => setField("nature", v as AccountNature)}
              >
                <SelectTrigger data-testid="select-nature">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT">{t("coa.nature.DEBIT")}</SelectItem>
                  <SelectItem value="CREDIT">{t("coa.nature.CREDIT")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Is Group */}
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
            <Switch
              id="isGroup"
              data-testid="switch-is-group"
              checked={form.isGroup}
              onCheckedChange={(v) => setField("isGroup", v)}
            />
            <div>
              <Label htmlFor="isGroup" className="cursor-pointer font-medium">{t("coa.isGroup")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("coa.isGroup.desc")}</p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("coa.notes")}</Label>
            <Textarea
              id="notes"
              data-testid="input-notes"
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || !form.code || !form.nameEn || !form.nameAr || !form.type} data-testid="button-submit-account">
              {isLoading ? t("coa.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── TreeNode ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: ChartOfAccountNode;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onEdit: (node: ChartOfAccountNode) => void;
  onDelete: (node: ChartOfAccountNode) => void;
  onToggleActive: (node: ChartOfAccountNode) => void;
  lang: string;
  t: (k: string) => string;
  dir: string;
}

function TreeNode({ node, expanded, onToggleExpand, onEdit, onDelete, onToggleActive, lang, t, dir }: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const typeCfg = TYPE_CONFIG[node.type as AccountType] || TYPE_CONFIG.ASSET;
  const indent = (node.level - 1) * 20;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 py-2 px-3 rounded-md transition-colors hover:bg-muted/50",
          !node.isActive && "opacity-50"
        )}
        data-testid={`row-account-${node.id}`}
      >
        {/* Indentation + expand toggle */}
        <div
          style={{ width: indent }}
          className="shrink-0"
        />
        <button
          type="button"
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded shrink-0 transition-colors",
            hasChildren ? "text-muted-foreground hover:text-foreground hover:bg-muted" : "text-transparent cursor-default"
          )}
          data-testid={`toggle-${node.id}`}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          ) : null}
        </button>

        {/* Type dot */}
        <span className={cn("w-2 h-2 rounded-full shrink-0", typeCfg.dot)} />

        {/* Link to detail */}
        <Link href={`/chart-of-accounts/${node.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-medium text-muted-foreground shrink-0 w-16 truncate">
              {node.code}
            </span>
            <span className={cn("font-medium truncate text-sm", !node.isActive && "line-through text-muted-foreground")}>
              {lang === "ar" ? node.nameAr : node.nameEn}
            </span>
            {lang === "en" && node.nameAr && (
              <span className="text-xs text-muted-foreground truncate hidden sm:block" dir="rtl">
                {node.nameAr}
              </span>
            )}
          </div>
        </Link>

        {/* Badges */}
        <div className="hidden lg:flex items-center gap-1.5 shrink-0">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", typeCfg.color)}>
            {lang === "ar" ? typeCfg.labelAr : typeCfg.label}
          </span>
          <Badge variant="outline" className="text-xs py-0">
            {node.nature === "DEBIT" ? t("coa.nature.DEBIT") : t("coa.nature.CREDIT")}
          </Badge>
          {node.isGroup ? (
            <Badge variant="secondary" className="text-xs py-0">{t("coa.badge.group")}</Badge>
          ) : (
            <Badge variant="outline" className="text-xs py-0 border-dashed text-muted-foreground">{t("coa.badge.leaf")}</Badge>
          )}
        </div>

        {/* Level indicator */}
        <span className="hidden md:block text-xs text-muted-foreground/60 shrink-0 w-6 text-center">
          L{node.level}
        </span>

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onEdit(node); }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={t("coa.edit")}
            data-testid={`btn-edit-${node.id}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onToggleActive(node); }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={node.isActive ? t("coa.deactivate") : t("coa.activate")}
            data-testid={`btn-toggle-active-${node.id}`}
          >
            {node.isActive
              ? <ToggleRight className="w-4 h-4 text-emerald-600" />
              : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            }
          </button>
          {!node.isGroup && (!node.children || node.children.length === 0) && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onDelete(node); }}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title={t("coa.delete")}
              data-testid={`btn-delete-${node.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {(node.children || []).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
              lang={lang}
              t={t}
              dir={dir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ChartOfAccounts() {
  const { lang, dir, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editNode, setEditNode] = useState<ChartOfAccountNode | null>(null);
  const [deleteNode, setDeleteNode] = useState<ChartOfAccountNode | null>(null);

  // Data
  const treeQuery = useGetChartOfAccountsTree({});
  const tree: ChartOfAccountNode[] = treeQuery.data || [];
  const allAccounts = useMemo(() => flattenTree(tree), [tree]);

  // Expand all by default when first loaded
  const allIds = useMemo(() => allAccounts.map((a) => a.id), [allAccounts]);

  // Initialize expanded to first two levels
  const initExpanded = useMemo(() => {
    return new Set(allAccounts.filter((a) => a.level <= 2).map((a) => a.id));
  }, [allAccounts]);

  const [expandedInitialized, setExpandedInitialized] = useState(false);
  if (!expandedInitialized && allAccounts.length > 0) {
    setExpanded(initExpanded);
    setExpandedInitialized(true);
  }

  // Search-filtered flat list
  const searchResults = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return allAccounts.filter(
      (a) =>
        (a.code.toLowerCase().includes(q) ||
          a.nameEn.toLowerCase().includes(q) ||
          a.nameAr.includes(q)) &&
        (typeFilter === "__all__" || a.type === typeFilter) &&
        (statusFilter === "__all__" || (statusFilter === "active" ? a.isActive : !a.isActive))
    );
  }, [search, allAccounts, typeFilter, statusFilter]);

  // Filtered tree (by type/status) — for tree view
  const filteredTree = useMemo(() => {
    if (typeFilter === "__all__" && statusFilter === "__all__") return tree;
    const filterNodes = (nodes: ChartOfAccountNode[]): ChartOfAccountNode[] =>
      nodes
        .map((n) => ({ ...n, children: filterNodes(n.children || []) }))
        .filter(
          (n) =>
            (typeFilter === "__all__" || n.type === typeFilter) &&
            (statusFilter === "__all__" || (statusFilter === "active" ? n.isActive : !n.isActive)) ||
            (n.children && n.children.length > 0)
        );
    return filterNodes(tree);
  }, [tree, typeFilter, statusFilter]);

  // Mutations
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetChartOfAccountsTreeQueryKey({}) });
  }, [queryClient]);

  const createMutation = useCreateChartOfAccount();
  const updateMutation = useUpdateChartOfAccount();
  const deleteMutation = useDeleteChartOfAccount();
  const toggleMutation = useToggleChartOfAccountActive();

  // Handlers
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(allIds));
  const collapseAll = () => setExpanded(new Set());

  const handleCreate = (form: AccountFormData) => {
    if (!form.type) return;
    const payload: CreateChartOfAccountInput = {
      parentId: form.parentId ?? undefined,
      code: form.code,
      nameEn: form.nameEn,
      nameAr: form.nameAr,
      type: form.type as AccountType,
      nature: form.nature ? (form.nature as AccountNature) : undefined,
      isGroup: form.isGroup,
      notes: form.notes || undefined,
    };
    createMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم إنشاء الحساب بنجاح" : "Account created successfully" });
          setCreateOpen(false);
          invalidate();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || (lang === "ar" ? "حدث خطأ" : "An error occurred");
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleEdit = (form: AccountFormData) => {
    if (!editNode) return;
    const payload: UpdateChartOfAccountInput = {};
    if (form.code !== editNode.code) payload.code = form.code;
    if (form.nameEn !== editNode.nameEn) payload.nameEn = form.nameEn;
    if (form.nameAr !== editNode.nameAr) payload.nameAr = form.nameAr;
    if (form.type && form.type !== editNode.type) payload.type = form.type as AccountType;
    if (form.nature && form.nature !== editNode.nature) payload.nature = form.nature as AccountNature;
    if (form.isGroup !== editNode.isGroup) payload.isGroup = form.isGroup;
    if ((form.notes || null) !== (editNode.notes || null)) payload.notes = form.notes || null;
    if (form.parentId !== editNode.parentId) payload.parentId = form.parentId ?? null;

    updateMutation.mutate(
      { id: editNode.id, data: payload },
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم تحديث الحساب" : "Account updated successfully" });
          setEditNode(null);
          invalidate();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || (lang === "ar" ? "حدث خطأ" : "An error occurred");
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteNode) return;
    deleteMutation.mutate(
      { id: deleteNode.id },
      {
        onSuccess: () => {
          toast({ title: lang === "ar" ? "تم حذف الحساب" : "Account deleted" });
          setDeleteNode(null);
          invalidate();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || (lang === "ar" ? "حدث خطأ" : "An error occurred");
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleToggleActive = (node: ChartOfAccountNode) => {
    toggleMutation.mutate(
      { id: node.id },
      {
        onSuccess: (updated) => {
          toast({
            title: (updated as any).isActive
              ? (lang === "ar" ? "تم تفعيل الحساب" : "Account activated")
              : (lang === "ar" ? "تم تعطيل الحساب" : "Account deactivated"),
          });
          invalidate();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || (lang === "ar" ? "حدث خطأ" : "An error occurred");
          toast({ title: msg, variant: "destructive" });
        },
      }
    );
  };

  const editFormData = useMemo((): (AccountFormData & { id: string }) | undefined => {
    if (!editNode) return undefined;
    return {
      id: editNode.id,
      parentId: editNode.parentId ?? null,
      code: editNode.code,
      nameEn: editNode.nameEn,
      nameAr: editNode.nameAr,
      type: editNode.type as AccountType,
      nature: editNode.nature as AccountNature,
      isGroup: editNode.isGroup,
      notes: editNode.notes || "",
    };
  }, [editNode]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              {t("nav.dashboard")}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
            <span>{t("coa.title")}</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight">{t("coa.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("coa.subtitle")}</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="shadow-sm shrink-0"
          data-testid="button-new-account"
        >
          <Plus className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
          {t("coa.new")}
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.keys(TYPE_CONFIG) as AccountType[]).map((type) => {
          const count = allAccounts.filter((a) => a.type === type && !a.isGroup).length;
          const cfg = TYPE_CONFIG[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(typeFilter === type ? "__all__" : type)}
              className={cn(
                "rounded-lg border px-4 py-3 text-start transition-all hover:shadow-sm",
                typeFilter === type
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/50 bg-card hover:border-border"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("w-2 h-2 rounded-full", cfg.dot)} />
                <span className="text-xs font-medium text-muted-foreground">
                  {lang === "ar" ? cfg.labelAr : cfg.label}
                </span>
              </div>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{lang === "ar" ? "حسابات" : "accounts"}</p>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-3 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("coa.search")}
                className="ltr:pl-9 rtl:pr-9 ltr:pr-8 rtl:pl-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Type filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44" data-testid="select-type-filter">
                <SelectValue placeholder={t("coa.filter.type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("coa.filter.all")} {t("coa.filter.type")}</SelectItem>
                {(Object.keys(TYPE_CONFIG) as AccountType[]).map((type) => (
                  <SelectItem key={type} value={type}>
                    <span className={cn("inline-block w-2 h-2 rounded-full ltr:mr-2 rtl:ml-2", TYPE_CONFIG[type].dot)} />
                    {lang === "ar" ? TYPE_CONFIG[type].labelAr : TYPE_CONFIG[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("coa.filter.all")}</SelectItem>
                <SelectItem value="active">{t("coa.badge.active")}</SelectItem>
                <SelectItem value="inactive">{t("coa.badge.inactive")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Expand / Collapse */}
            {!search && (
              <div className="flex items-center gap-1 ltr:ml-auto rtl:mr-auto">
                <Button variant="ghost" size="sm" onClick={expandAll} data-testid="button-expand-all">
                  <ChevronsUpDown className="w-4 h-4 ltr:mr-1.5 rtl:ml-1.5" />
                  {t("coa.expandAll")}
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll} data-testid="button-collapse-all">
                  <ChevronsDownUp className="w-4 h-4 ltr:mr-1.5 rtl:ml-1.5" />
                  {t("coa.collapseAll")}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Column headers */}
          {!search && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
              <div style={{ width: 20 }} />
              <div style={{ width: 8 }} />
              <div className="w-16">{t("coa.code")}</div>
              <div className="flex-1">{lang === "ar" ? "الاسم" : "Name"}</div>
              <div className="hidden lg:flex gap-20 ltr:mr-8 rtl:ml-8">
                <span>{t("coa.type")}</span>
              </div>
            </div>
          )}

          {/* Loading */}
          {treeQuery.isLoading && (
            <div className="space-y-2 p-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton style={{ width: (i % 3) * 20 }} className="h-4" />
                  <Skeleton className="w-2 h-2 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {treeQuery.isError && (
            <div className="flex items-center justify-center py-12 text-destructive">
              <p>{t("common.error")}</p>
            </div>
          )}

          {/* Search results — flat list */}
          {!treeQuery.isLoading && search && (
            <div>
              {searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <BookOpen className="w-10 h-10 mb-3 opacity-30" />
                  <p className="font-medium">{t("coa.empty.search")}</p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {searchResults.map((node) => {
                    const cfg = TYPE_CONFIG[node.type as AccountType];
                    return (
                      <Link
                        key={node.id}
                        href={`/chart-of-accounts/${node.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors rounded-md"
                        data-testid={`search-result-${node.id}`}
                      >
                        <span className={cn("w-2 h-2 rounded-full shrink-0", cfg?.dot)} />
                        <span className="font-mono text-sm text-muted-foreground w-16 shrink-0">{node.code}</span>
                        <span className="font-medium text-sm flex-1">
                          {lang === "ar" ? node.nameAr : node.nameEn}
                        </span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full hidden sm:block", cfg?.color)}>
                          {lang === "ar" ? cfg?.labelAr : cfg?.label}
                        </span>
                        <Badge variant="outline" className="text-xs hidden md:flex">
                          L{node.level}
                        </Badge>
                        {!node.isActive && (
                          <Badge variant="secondary" className="text-xs">{t("coa.badge.inactive")}</Badge>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tree view */}
          {!treeQuery.isLoading && !search && (
            <div>
              {filteredTree.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mb-3 opacity-20" />
                  <p className="font-medium text-base mb-1">{t("coa.empty")}</p>
                  <p className="text-sm mb-4">{t("coa.empty.desc")}</p>
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 ltr:mr-2 rtl:ml-2" />
                    {t("coa.new")}
                  </Button>
                </div>
              ) : (
                filteredTree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    expanded={expanded}
                    onToggleExpand={toggleExpand}
                    onEdit={setEditNode}
                    onDelete={setDeleteNode}
                    onToggleActive={handleToggleActive}
                    lang={lang}
                    t={t}
                    dir={dir}
                  />
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <AccountFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        allAccounts={allAccounts}
        onSubmit={handleCreate}
        isLoading={createMutation.isPending}
        title={t("coa.create")}
      />

      {/* Edit dialog */}
      {editNode && (
        <AccountFormDialog
          open={!!editNode}
          onClose={() => setEditNode(null)}
          initialData={editFormData}
          allAccounts={allAccounts}
          onSubmit={handleEdit}
          isLoading={updateMutation.isPending}
          title={t("coa.edit")}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteNode} onOpenChange={(o) => !o && setDeleteNode(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("coa.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("coa.confirmDelete.desc")}
              {deleteNode && (
                <span className="block mt-2 font-mono font-medium text-foreground">
                  {deleteNode.code} — {lang === "ar" ? deleteNode.nameAr : deleteNode.nameEn}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? t("coa.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
