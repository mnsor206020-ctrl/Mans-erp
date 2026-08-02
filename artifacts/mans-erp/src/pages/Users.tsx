import { useState, useCallback } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/language-provider";
import {
  useListUsers,
  useUpdateUserStatus,
  useListRoles,
  useCreateInvitation,
  useListInvitations,
  useRevokeInvitation,
  getListUsersQueryKey,
  getListInvitationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserPlus, Search, ChevronLeft, ChevronRight, Eye, UserCheck, UserX,
  Mail, Copy, Check, Trash2,
} from "lucide-react";
import type { UserProfileStatus, InvitationStatus } from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  INACTIVE:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const INV_STATUS_COLORS: Record<string, string> = {
  PENDING:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  REVOKED:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  EXPIRED:  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function Users() {
  const { t, lang, dir } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── list state ───────────────────────────────────────────────────────────
  const [search, setSearch]   = useState("");
  const [status, setStatus]   = useState<string>("all");
  const [roleId, setRoleId]   = useState<string>("all");
  const [page, setPage]       = useState(1);
  const limit = 20;

  const listParams = {
    ...(search ? { search } : {}),
    ...(status !== "all" ? { status: status as UserProfileStatus } : {}),
    ...(roleId !== "all" ? { roleId } : {}),
    page,
    limit,
  };

  const { data: usersData, isLoading: usersLoading } = useListUsers(listParams);
  const { data: roles } = useListRoles();

  // ── status toggle ─────────────────────────────────────────────────────────
  const [confirmUser, setConfirmUser] = useState<{ id: string; name: string; action: "activate" | "deactivate" } | null>(null);
  const { mutate: updateStatus, isPending: statusPending } = useUpdateUserStatus({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListUsersQueryKey(listParams) });
        toast({ title: confirmUser?.action === "activate" ? t("users.status.ACTIVE") : t("users.status.INACTIVE") });
        setConfirmUser(null);
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Error";
        toast({ title: msg, variant: "destructive" });
        setConfirmUser(null);
      },
    },
  });

  // ── invitations ───────────────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail]  = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");

  const { data: invitations, isLoading: invLoading } = useListInvitations();
  const { mutate: createInvitation, isPending: inviting } = useCreateInvitation({
    mutation: {
      onSuccess: (inv) => {
        qc.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
        setShowInviteModal(false);
        setInviteEmail(""); setInviteRoleId("");
        toast({ title: lang === "ar" ? `تم إرسال الدعوة إلى ${inv.email}` : `Invitation sent to ${inv.email}` });
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Error";
        toast({ title: msg, variant: "destructive" });
      },
    },
  });

  const [revokeTarget, setRevokeTarget] = useState<{ id: string; email: string } | null>(null);
  const { mutate: revokeInvitation, isPending: revoking } = useRevokeInvitation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
        toast({ title: lang === "ar" ? "تم إلغاء الدعوة" : "Invitation revoked" });
        setRevokeTarget(null);
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Error";
        toast({ title: msg, variant: "destructive" });
        setRevokeTarget(null);
      },
    },
  });

  // ── copy invite link ──────────────────────────────────────────────────────
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const copyLink = useCallback((token: string) => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}accept-invitation?token=${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }, []);

  const total = usersData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("users.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("users.subtitle")}</p>
        </div>
        <Button onClick={() => setShowInviteModal(true)} className="shadow-sm">
          <UserPlus className={`h-4 w-4 ${lang === "ar" ? "ml-2" : "mr-2"}`} />
          {t("users.invite")}
        </Button>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">{t("users.title")}</TabsTrigger>
          <TabsTrigger value="invitations">{t("invitations.title")}</TabsTrigger>
        </TabsList>

        {/* ── Members tab ─────────────────────────────────────────────────── */}
        <TabsContent value="members" className="mt-4">
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${lang === "ar" ? "right-3" : "left-3"}`} />
                  <Input
                    placeholder={t("users.search")}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className={lang === "ar" ? "pr-9" : "pl-9"}
                  />
                </div>
                <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder={t("users.filterStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("users.filterStatus")}</SelectItem>
                    <SelectItem value="ACTIVE">{t("users.status.ACTIVE")}</SelectItem>
                    <SelectItem value="INACTIVE">{t("users.status.INACTIVE")}</SelectItem>
                    <SelectItem value="SUSPENDED">{t("users.status.SUSPENDED")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={roleId} onValueChange={(v) => { setRoleId(v); setPage(1); }}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder={t("users.filterRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("users.filterRole")}</SelectItem>
                    {roles?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {lang === "ar" ? r.nameAr : r.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border/50">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>{t("users.col.name")}</TableHead>
                      <TableHead>{t("users.col.email")}</TableHead>
                      <TableHead>{t("users.col.roles")}</TableHead>
                      <TableHead>{t("users.col.status")}</TableHead>
                      <TableHead>{t("users.col.joined")}</TableHead>
                      <TableHead className="text-right rtl:text-left">{t("users.col.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersLoading ? (
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(6)].map((__, j) => (
                            <TableCell key={j}><Skeleton className="h-5 w-24" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : !usersData?.data?.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          {t("users.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      usersData.data.map((user) => {
                        const fullName = [
                          lang === "ar" ? user.firstNameAr : user.firstNameEn,
                          lang === "ar" ? user.lastNameAr : user.lastNameEn,
                        ].filter(Boolean).join(" ") || user.email;

                        return (
                          <TableRow key={user.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                                  {user.email.charAt(0).toUpperCase()}
                                </div>
                                <span>{fullName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {user.userRoles?.length ? user.userRoles.map((ur) => (
                                  <Badge key={ur.roleId} variant="secondary" className="text-xs">
                                    {lang === "ar" ? ur.role.nameAr : ur.role.nameEn}
                                  </Badge>
                                )) : (
                                  <span className="text-xs text-muted-foreground">{t("users.noRoles")}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status] ?? ""}`}>
                                {t(`users.status.${user.status}`)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(user.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB")}
                            </TableCell>
                            <TableCell className="text-right rtl:text-left">
                              <div className="flex items-center justify-end rtl:justify-start gap-1">
                                <Link href={`/users/${user.id}`}>
                                  <Button variant="ghost" size="icon" title={t("users.viewDetail")}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                {user.status === "ACTIVE" ? (
                                  <Button
                                    variant="ghost" size="icon"
                                    title={t("users.deactivate")}
                                    onClick={() => setConfirmUser({ id: user.id, name: fullName, action: "deactivate" })}
                                  >
                                    <UserX className="h-4 w-4 text-destructive" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost" size="icon"
                                    title={t("users.activate")}
                                    onClick={() => setConfirmUser({ id: user.id, name: fullName, action: "activate" })}
                                  >
                                    <UserCheck className="h-4 w-4 text-emerald-600" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {total > limit && (
                <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                  <span>
                    {lang === "ar"
                      ? `${total} مستخدم — صفحة ${page} من ${totalPages}`
                      : `${total} users — Page ${page} of ${totalPages}`}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline" size="icon"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      {dir === "rtl" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline" size="icon"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {dir === "rtl" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Invitations tab ──────────────────────────────────────────────── */}
        <TabsContent value="invitations" className="mt-4">
          <Card className="shadow-sm border-border/50">
            <CardContent className="pt-6">
              <div className="rounded-md border border-border/50">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>{t("invitations.col.email")}</TableHead>
                      <TableHead>{t("invitations.col.role")}</TableHead>
                      <TableHead>{t("invitations.col.status")}</TableHead>
                      <TableHead>{t("invitations.col.sentAt")}</TableHead>
                      <TableHead>{t("invitations.col.expiresAt")}</TableHead>
                      <TableHead className="text-right rtl:text-left">{t("invitations.col.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invLoading ? (
                      [...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(6)].map((__, j) => (
                            <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : !invitations?.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          {t("invitations.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      invitations.map((inv) => (
                        <TableRow key={inv.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {inv.email}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {lang === "ar" ? inv.role?.nameAr : inv.role?.nameEn}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INV_STATUS_COLORS[inv.status] ?? ""}`}>
                              {t(`invitations.status.${inv.status}`)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB")}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(inv.expiresAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB")}
                          </TableCell>
                          <TableCell className="text-right rtl:text-left">
                            <div className="flex items-center justify-end rtl:justify-start gap-1">
                              {inv.status === "PENDING" && (
                                <>
                                  <Button
                                    variant="ghost" size="icon"
                                    title={t("invitations.copyLink")}
                                    onClick={() => copyLink(inv.token)}
                                  >
                                    {copiedToken === inv.token
                                      ? <Check className="h-4 w-4 text-emerald-500" />
                                      : <Copy className="h-4 w-4" />}
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon"
                                    title={t("invitations.revoke")}
                                    onClick={() => setRevokeTarget({ id: inv.id, email: inv.email })}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Invite Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>{t("invitations.invite")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("invitations.form.email")}</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("invitations.form.role")}</label>
              <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("users.filterRole")} />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {lang === "ar" ? r.nameAr : r.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteModal(false)}>
              {t("invitations.form.cancel")}
            </Button>
            <Button
              disabled={!inviteEmail || !inviteRoleId || inviting}
              onClick={() => createInvitation({ data: { email: inviteEmail, roleId: inviteRoleId } })}
            >
              {inviting
                ? (lang === "ar" ? "جارٍ الإرسال…" : "Sending…")
                : t("invitations.form.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Status confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmUser} onOpenChange={() => setConfirmUser(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmUser?.action === "activate" ? t("users.activate") : t("users.deactivate")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? `هل تريد ${confirmUser?.action === "activate" ? "تفعيل" : "إيقاف"} ${confirmUser?.name}؟`
                : `${confirmUser?.action === "activate" ? "Activate" : "Deactivate"} ${confirmUser?.name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusPending}
              onClick={() => {
                if (confirmUser) {
                  updateStatus({
                    id: confirmUser.id,
                    data: { status: confirmUser.action === "activate" ? "ACTIVE" : "INACTIVE" },
                  });
                }
              }}
            >
              {lang === "ar" ? "تأكيد" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Revoke confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("invitations.revoke")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("invitations.confirmRevoke")} ({revokeTarget?.email})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              disabled={revoking}
              onClick={() => revokeTarget && revokeInvitation({ id: revokeTarget.id })}
            >
              {lang === "ar" ? "تأكيد" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
