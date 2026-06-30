import { useLanguage } from "@/lib/language-provider";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Building2, Users, ShieldCheck, ArrowRight, Activity } from "lucide-react";
import { useAuth } from "@clerk/react";

export default function Home() {
  const { t, lang, dir } = useLanguage();
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="container mx-auto px-4 h-20 flex items-center justify-between border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl shadow-sm">
            M
          </div>
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {t('app.name')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {isSignedIn ? (
            <Link href="/dashboard">
              <Button size="lg" className="font-medium shadow-sm">
                {t('nav.dashboard')}
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/sign-in">
                <Button variant="ghost" className="font-medium text-muted-foreground hover:text-foreground">
                  {t('nav.signIn')}
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button className="font-medium shadow-sm">
                  {t('nav.getStarted')}
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        <section className="py-24 sm:py-32 lg:py-40 px-4 container mx-auto text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary font-medium text-sm mb-8 ring-1 ring-inset ring-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            {lang === 'ar' ? 'منصة متكاملة للقطاع الثالث' : 'Unified Platform for the Third Sector'}
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-foreground max-w-4xl leading-tight sm:leading-tight md:leading-tight mb-6">
            {t('landing.hero.title')}
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link href={isSignedIn ? "/dashboard" : "/sign-up"} className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto text-base h-14 px-8 shadow-sm">
                {t('landing.cta.primary')}
                {dir === 'ltr' && <ArrowRight className="ml-2 h-5 w-5" />}
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-14 px-8 border-2">
              {t('landing.cta.secondary')}
            </Button>
          </div>
        </section>

        <section className="py-20 bg-muted/30 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className="flex flex-col items-center text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 ring-1 ring-inset ring-primary/20">
                  <Building2 className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">
                  {lang === 'ar' ? 'إدارة المنظمات' : 'Organization Management'}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {lang === 'ar' ? 'نظام مركزي لإدارة فروع المنظمة وهيكلها الإداري بصلاحيات دقيقة.' : 'Centralized system to manage branches, hierarchy, and granular permissions.'}
                </p>
              </div>
              <div className="flex flex-col items-center text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 ring-1 ring-inset ring-primary/20">
                  <Users className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">
                  {lang === 'ar' ? 'إدارة المستفيدين' : 'Beneficiary Management'}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {lang === 'ar' ? 'قاعدة بيانات شاملة لتوثيق وتتبع خدمات الرعاية المقدمة للمستفيدين.' : 'Comprehensive database to document and track care services provided to beneficiaries.'}
                </p>
              </div>
              <div className="flex flex-col items-center text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 ring-1 ring-inset ring-primary/20">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">
                  {lang === 'ar' ? 'حوكمة وأمان' : 'Governance & Security'}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {lang === 'ar' ? 'بنية تحتية آمنة تتوافق مع متطلبات المركز الوطني لتنمية القطاع غير الربحي.' : 'Secure infrastructure compliant with the National Center for Non-Profit Sector requirements.'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="py-10 text-center text-sm text-muted-foreground border-t border-border/40">
        <p>&copy; {new Date().getFullYear()} Mans ERP. {lang === 'ar' ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}</p>
      </footer>
    </div>
  );
}
