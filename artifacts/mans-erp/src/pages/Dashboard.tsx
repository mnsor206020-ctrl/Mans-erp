import { useLanguage } from "@/lib/language-provider";
import { useGetDashboardStats, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Building2, Briefcase, HeartHandshake, Banknote, TrendingUp, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";

export default function Dashboard() {
  const { t, lang } = useLanguage();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  const statCards = [
    { title: t('dashboard.stats.users'), value: stats?.totalUsers, icon: Users, color: "text-blue-600" },
    { title: t('dashboard.stats.orgs'), value: stats?.totalOrganizations, icon: Building2, color: "text-indigo-600" },
    { title: t('dashboard.stats.projects'), value: stats?.activeProjects, icon: Briefcase, color: "text-violet-600" },
    { title: t('dashboard.stats.beneficiaries'), value: stats?.totalBeneficiaries, icon: HeartHandshake, color: "text-purple-600" },
    { title: t('dashboard.stats.donations'), value: stats?.totalDonations ? `$${stats.totalDonations.toLocaleString()}` : '0', icon: Banknote, color: "text-emerald-600" },
    { title: t('dashboard.stats.growth'), value: stats?.monthlyGrowth ? `${stats.monthlyGrowth}%` : '0%', icon: TrendingUp, color: "text-teal-600" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h2>
          <p className="text-muted-foreground mt-1">
            {lang === 'ar' ? 'نظرة عامة على أداء المنظومة' : 'Overview of system performance'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, i) => (
          <Card key={i} className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color} opacity-80`} />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-3xl font-bold">{stat.value || 0}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle>{t('dashboard.activity.title')}</CardTitle>
            </div>
            <CardDescription>
              {lang === 'ar' ? 'آخر الإجراءات المسجلة في النظام' : 'Recent actions recorded in the system'}
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
            ) : activity && activity.length > 0 ? (
              <div className="space-y-6">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-medium text-sm">{item.userName.charAt(0)}</span>
                    </div>
                    <div className="flex flex-col flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none text-foreground">
                        {lang === 'ar' ? item.descriptionAr : item.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.userName} • {format(new Date(item.createdAt), 'PPpp', { locale: lang === 'ar' ? arSA : undefined })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('common.noData')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
