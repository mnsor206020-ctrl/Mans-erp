import { useState } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import {
  useGetUser,
  useAssignUserRole,
  useRemoveUserRole,
  useUpdateUserStatus,
  useListRoles,
  getGetUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowRight, UserCheck, UserX, Plus, X } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  INACTIVE:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

interface UserDetailProps {
  params: { id: string };
}

export default function UserDetail({ params }: UserDetailProps) {
  const { id } = params;
  const { t, lang, dir } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useGetUser(id);
  const { data: allRoles } = useListRoles();

  // ── assign role ───────────────────────────────────────────────────────────
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const { mutate: assignRole, isPending: assigning } = useAssignUserRole({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUserQueryKey(id) });
        setSelectedRoleId("");
        toast({ title: lang === "ar" ? "تم تعيين الدور" : "Role assigned" });
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Error";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  // ── remove role ───────────────────────────────────────────────────────────
  const [removeTarget, setRemoveTarget] = useState<{ roleId: string; roleName: string } | null>(null);
  const { mutate: removeRole, isPending: removing } = useRemoveUserRole({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUserQueryKey(id) });
        toast({ title: lang === "ar" ? "تم إزالة الدور" : "Role removed" });
        setRemoveTarget(null);
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Error";
        toast({ title: msg, variant: "destructive" });
        setRemoveTarget(null);
      },
    },
  });

  // ── status toggle ─────────────────────────────────────────────────────────
  const [confirmStatus, setConfirmStatus] = useState<"activate" | "deactivate" | null>(null);
  const { mutate: updateStatus, isPending: statusPending } = useUpdateUserStatus({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUserQueryKey(id) });
        toast({ title: lang === "ar" ? "تم تحديث الحالة" : "Status updated" });
        setConfirmStatus(null);
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Error";
        toast({ title: msg, variant: "destructive" });
        setConfirmStatus(null);
      },
    },
  });

  const assignedRoleIds = new Set(user?.userRoles?.map((ur) => ur.roleId) ?? []);
  const availableRoles = allRoles?.filter((r) => !assignedRoleIds.has(r.id)) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500" dir={dir}>
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-20 text-muted-foreground" dir={dir}>
        {lang === "ar" ? "المستخدم غير موجود" : "User not found"}
      </div>
    );
  }

  const fullName = [
    lang === "ar" ? user.firstNameAr : user.firstNameEn,
    lang === "ar" ? user.lastNameAr : user.lastNameEn,
  ].filter(Boolean).join(" ") || user.email;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir={dir}>
      {/* Back link */}
      <Link href="/users">
        <Button variant="ghost" size="sm" className="gap-2">
          {dir === "rtl" ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          {t("users.detail.back")}
        </Button>
      </Link>

      <h2 className="text-3xl font-bold tracking-tight">{fullName}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Profile card ───────────────────────────────────────────────── */}
        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-base">{t("users.detail.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted-foreground font-medium">{t("users.col.email")}</dt>
              <dd>{user.email}</dd>

              <dt className="text-muted-foreground font-medium">{t("users.detail.status")}</dt>
              <dd>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status] ?? ""}`}>
                  {t(`users.status.${user.status}`)}
                </span>
              </dd>

              {user.organization && (
                <>
                  <dt className="text-muted-foreground font-medium">{t("users.detail.organization")}</dt>
                  <dd>{lang === "ar" ? user.organization.nameAr : user.organization.nameEn}</dd>
                </>
              )}

              <dt className="text-muted-foreground font-medium">{t("users.detail.joinedAt")}</dt>
              <dd>{new Date(user.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB")}</dd>
            </dl>

            <div className="pt-2 flex gap-2">
              {user.status === "ACTIVE" ? (
                <Button
                  variant="outline" size="sm"
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => setConfirmStatus("deactivate")}
                >
                  <UserX className={`h-4 w-4 ${lang === "ar" ? "ml-2" : "mr-2"}`} />
                  {t("users.deactivate")}
                </Button>
              ) : (
                <Button
                  variant="outline" size="sm"
                  className="text-emerald-600 hover:text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/10"
                  onClick={() => setConfirmStatus("activate")}
                >
                  <UserCheck className={`h-4 w-4 ${lang === "ar" ? "ml-2" : "mr-2"}`} />
                  {t("users.activate")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Roles card ─────────────────────────────────────────────────── */}
        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle className="text-base">{t("users.detail.roles")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current roles */}
            {user.userRoles?.length ? (
              <div className="flex flex-wrap gap-2">
                {user.userRoles.map((ur) => (
                  <div key={ur.roleId} className="flex items-center gap-1">
                    <Badge variant="secondary" className="pe-1 text-sm">
                      {lang === "ar" ? ur.role.nameAr : ur.role.nameEn}
                      <button
                        className="ms-1 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                        title={t("users.detail.removeRole")}
                        onClick={() => setRemoveTarget({ roleId: ur.roleId, roleName: lang === "ar" ? ur.role.nameAr : ur.role.nameEn })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("users.detail.noRoles")}</p>
            )}

            {/* Add role */}
            {availableRoles.length > 0 && (
              <div className="flex gap-2 pt-2">
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("users.detail.addRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {lang === "ar" ? r.nameAr : r.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!selectedRoleId || assigning}
                  onClick={() => assignRole({ id, roleId: selectedRoleId })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Remove role confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={!!removeTarget} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("users.detail.removeRole")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("users.detail.confirmRemove")} — {removeTarget?.roleName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => removeTarget && removeRole({ id, roleId: removeTarget.roleId })}
            >
              {lang === "ar" ? "إزالة" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Status confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmStatus} onOpenChange={() => setConfirmStatus(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmStatus === "activate" ? t("users.activate") : t("users.deactivate")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? `هل تريد ${confirmStatus === "activate" ? "تفعيل" : "إيقاف"} ${fullName}؟`
                : `${confirmStatus === "activate" ? "Activate" : "Deactivate"} ${fullName}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusPending}
              onClick={() => {
                if (confirmStatus) {
                  updateStatus({
                    id,
                    data: { status: confirmStatus === "activate" ? "ACTIVE" : "INACTIVE" },
                  });
                }
              }}
            >
              {lang === "ar" ? "تأكيد" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
