import { useLanguage } from "@/lib/language-provider";
import { OrganizationPageGate } from "@/components/OrganizationPageGate";
import { useGetDashboardStats, useGetDashboardMonthly, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { ArrowDownCircle, ArrowUpCircle, Landmark, Wallet, BookOpen, TrendingUp, Activity, AlertCircle } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Chart config ─────────────────────────────────────────────────────────────

const chartConfig: ChartConfig = {
  receipts: { label: "Receipts", color: "hsl(var(--chart-1))" },
  payments: { label: "Payments", color: "hsl(var(--chart-2))" },
  net:      { label: "Net",      color: "hsl(var(--chart-3))" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  return <OrganizationPageGate><DashboardContent /></OrganizationPageGate>;
}

function DashboardContent() {
  const { t, lang } = useLanguage();

  const { data: stats,    isLoading: statsLoading,    isError: statsError }    = useGetDashboardStats();
  const { data: monthly,  isLoading: monthlyLoading,  isError: monthlyError }  = useGetDashboardMonthly();
  const { data: activity, isLoading: activityLoading, isError: activityError } = useGetRecentActivity();

  // ─── KPI cards ──────────────────────────────────────────────────────────────

  const kpiCards = [
    {
      title: t("dashboard.kpi.totalReceipts"),
      value: stats ? `SAR ${fmt(stats.totalReceipts)}` : undefined,
      icon:  ArrowDownCircle,
      color: "text-green-600",
    },
    {
      title: t("dashboard.kpi.totalPayments"),
      value: stats ? `SAR ${fmt(stats.totalPayments)}` : undefined,
      icon:  ArrowUpCircle,
      color: "text-red-500",
    },
    {
      title: t("dashboard.kpi.netCash"),
      value: stats ? `SAR ${fmt(stats.netCash)}` : undefined,
      icon:  TrendingUp,
      color: stats && stats.netCash >= 0 ? "text-emerald-600" : "text-destructive",
    },
    {
      title: t("dashboard.kpi.bankBalance"),
      value: stats ? `SAR ${fmt(stats.currentBankBalance)}` : undefined,
      icon:  Landmark,
      color: "text-blue-600",
    },
    {
      title: t("dashboard.kpi.cashBoxBalance"),
      value: stats ? `SAR ${fmt(stats.currentCashBoxBalance)}` : undefined,
      icon:  Wallet,
      color: "text-violet-600",
    },
    {
      title: t("dashboard.kpi.postedJEs"),
      value: stats ? String(stats.postedJournalEntriesCount) : undefined,
      icon:  BookOpen,
      color: "text-indigo-600",
    },
  ];

  // ─── Chart locale labels ─────────────────────────────────────────────────────

  const chartLabelReceipts = lang === "ar" ? "الإيرادات" : t("dashboard.chart.receipts");
  const chartLabelPayments = lang === "ar" ? "المدفوعات" : t("dashboard.chart.payments");
  const chartLabelNet      = lang === "ar" ? "الصافي"    : t("dashboard.chart.net");

  const localizedChartConfig: ChartConfig = {
    receipts: { label: chartLabelReceipts, color: "hsl(var(--chart-1))" },
    payments: { label: chartLabelPayments, color: "hsl(var(--chart-2))" },
    net:      { label: chartLabelNet,      color: "hsl(var(--chart-3))" },
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h2>
        <p className="text-muted-foreground mt-1">
          {lang === "ar" ? "نظرة عامة على الأداء المالي للمنظمة" : "Financial overview of your organization"}
        </p>
      </div>

      {/* ── KPI grid ───────────────────────────────────────────────────────── */}
      {statsError ? (
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{t("common.error")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {kpiCards.map((card, i) => (
            <Card key={i} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className={`h-5 w-5 ${card.color} opacity-80`} />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  <div className="text-2xl font-bold tabular-nums">{card.value ?? "—"}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Monthly chart ──────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>{t("dashboard.chart.title")}</CardTitle>
          <CardDescription>{t("dashboard.chart.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyError ? (
            <div className="flex items-center gap-3 py-8 text-destructive text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {t("common.error")}
            </div>
          ) : monthlyLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !monthly || monthly.every((m) => m.receipts === 0 && m.payments === 0) ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <TrendingUp className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">{t("dashboard.chart.empty")}</p>
            </div>
          ) : (
            <ChartContainer config={localizedChartConfig} className="h-72 w-full">
              <ComposedChart data={monthly} margin={{ top: 8, right: 16, left: 16, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)} // show MM only
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                  width={50}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend
                  iconType="square"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar
                  dataKey="receipts"
                  name={chartLabelReceipts}
                  fill="var(--color-receipts)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="payments"
                  name={chartLabelPayments}
                  fill="var(--color-payments)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name={chartLabelNet}
                  stroke="var(--color-net)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Activity feed ──────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle>{t("dashboard.activity.title")}</CardTitle>
          </div>
          <CardDescription>
            {lang === "ar"
              ? "آخر الإجراءات المسجلة في النظام"
              : "Recent actions recorded in the system"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 rtl:space-x-reverse">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-[250px]" />
                    <Skeleton className="h-4 w-[200px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : activityError ? (
            <div className="flex items-center gap-3 py-8 text-destructive text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {t("common.error")}
            </div>
          ) : activity && activity.length > 0 ? (
            <div className="space-y-6">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary font-medium text-sm">
                      {item.userName.charAt(0)}
                    </span>
                  </div>
                  <div className="flex flex-col flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none text-foreground">
                      {lang === "ar" ? item.descriptionAr : item.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.userName} •{" "}
                      {format(new Date(item.createdAt), "PPpp", {
                        locale: lang === "ar" ? arSA : undefined,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t("common.noData")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
