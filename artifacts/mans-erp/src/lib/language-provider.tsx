import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';
type Direction = 'ltr' | 'rtl';

interface LanguageContextType {
  lang: Language;
  dir: Direction;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  en: {
    "app.name": "Mans ERP",
    "nav.dashboard": "Dashboard",
    "nav.organizations": "Organizations",
    "nav.settings": "Settings",
    "nav.signIn": "Sign In",
    "nav.getStarted": "Get Started",
    "nav.logout": "Log Out",
    "landing.hero.title": "The modern operating system for Saudi nonprofits",
    "landing.hero.subtitle": "A secure, enterprise-grade platform to manage your operations, beneficiaries, and donations with complete confidence.",
    "landing.cta.primary": "Get Started",
    "landing.cta.secondary": "Contact Sales",
    "dashboard.title": "Dashboard",
    "dashboard.stats.users": "Total Users",
    "dashboard.stats.orgs": "Total Organizations",
    "dashboard.stats.projects": "Active Projects",
    "dashboard.stats.beneficiaries": "Beneficiaries",
    "dashboard.stats.donations": "Total Donations",
    "dashboard.stats.growth": "Monthly Growth",
    "dashboard.activity.title": "Recent Activity",
    "orgs.title": "Organizations",
    "orgs.new": "New Organization",
    "orgs.nameEn": "Name (English)",
    "orgs.nameAr": "Name (Arabic)",
    "orgs.type": "Type",
    "orgs.status": "Status",
    "orgs.city": "City",
    "orgs.email": "Email",
    "orgs.phone": "Phone",
    "orgs.registration": "Registration Number",
    "orgs.submit": "Create Organization",
    "settings.title": "Settings",
    "settings.profile": "User Profile",
    "settings.firstNameEn": "First Name (English)",
    "settings.lastNameEn": "Last Name (English)",
    "settings.firstNameAr": "First Name (Arabic)",
    "settings.lastNameAr": "Last Name (Arabic)",
    "settings.role": "Role",
    "settings.email": "Email",
    "settings.save": "Save Changes",
    "common.loading": "Loading...",
    "common.error": "An error occurred.",
    "common.success": "Operation successful.",
    "common.noData": "No data available."
  },
  ar: {
    "app.name": "منظومة مانز",
    "nav.dashboard": "لوحة القيادة",
    "nav.organizations": "المنظمات",
    "nav.settings": "الإعدادات",
    "nav.signIn": "تسجيل الدخول",
    "nav.getStarted": "ابدأ الآن",
    "nav.logout": "تسجيل الخروج",
    "landing.hero.title": "نظام التشغيل الحديث للقطاع غير الربحي",
    "landing.hero.subtitle": "منصة آمنة بمستوى المؤسسات لإدارة عملياتك والمستفيدين والتبرعات بثقة تامة.",
    "landing.cta.primary": "ابدأ الآن",
    "landing.cta.secondary": "تواصل مع المبيعات",
    "dashboard.title": "لوحة القيادة",
    "dashboard.stats.users": "إجمالي المستخدمين",
    "dashboard.stats.orgs": "إجمالي المنظمات",
    "dashboard.stats.projects": "المشاريع النشطة",
    "dashboard.stats.beneficiaries": "المستفيدين",
    "dashboard.stats.donations": "إجمالي التبرعات",
    "dashboard.stats.growth": "النمو الشهري",
    "dashboard.activity.title": "النشاط الأخير",
    "orgs.title": "المنظمات",
    "orgs.new": "منظمة جديدة",
    "orgs.nameEn": "الاسم (إنجليزي)",
    "orgs.nameAr": "الاسم (عربي)",
    "orgs.type": "النوع",
    "orgs.status": "الحالة",
    "orgs.city": "المدينة",
    "orgs.email": "البريد الإلكتروني",
    "orgs.phone": "رقم الهاتف",
    "orgs.registration": "رقم التسجيل",
    "orgs.submit": "إنشاء المنظمة",
    "settings.title": "الإعدادات",
    "settings.profile": "الملف الشخصي",
    "settings.firstNameEn": "الاسم الأول (إنجليزي)",
    "settings.lastNameEn": "اسم العائلة (إنجليزي)",
    "settings.firstNameAr": "الاسم الأول (عربي)",
    "settings.lastNameAr": "اسم العائلة (عربي)",
    "settings.role": "الدور",
    "settings.email": "البريد الإلكتروني",
    "settings.save": "حفظ التغييرات",
    "common.loading": "جاري التحميل...",
    "common.error": "حدث خطأ.",
    "common.success": "تمت العملية بنجاح.",
    "common.noData": "لا توجد بيانات متاحة."
  }
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('mans-erp-lang') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'ar')) {
      setLangState(savedLang);
    }
  }, []);

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('mans-erp-lang', newLang);
  };

  const t = (key: string) => {
    return translations[lang][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
