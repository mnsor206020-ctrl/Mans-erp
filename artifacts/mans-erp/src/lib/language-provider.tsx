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
    "nav.accounting": "Accounting",
    "nav.chartOfAccounts": "Chart of Accounts",
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
    "coa.title": "Chart of Accounts",
    "coa.subtitle": "Manage your organization's account structure",
    "coa.new": "New Account",
    "coa.search": "Search accounts...",
    "coa.filter.type": "Account Type",
    "coa.filter.status": "Status",
    "coa.filter.all": "All",
    "coa.expandAll": "Expand All",
    "coa.collapseAll": "Collapse All",
    "coa.treeView": "Tree View",
    "coa.listView": "List View",
    "coa.code": "Code",
    "coa.nameEn": "Name (English)",
    "coa.nameAr": "Name (Arabic)",
    "coa.type": "Type",
    "coa.nature": "Nature",
    "coa.parent": "Parent Account",
    "coa.parent.none": "None (Top-level)",
    "coa.isGroup": "Group Account",
    "coa.isGroup.desc": "Group accounts cannot receive journal entries directly",
    "coa.level": "Level",
    "coa.isActive": "Active",
    "coa.allowDirectEntry": "Allows Direct Entry",
    "coa.notes": "Notes",
    "coa.currency": "Currency",
    "coa.transactionCount": "Transactions",
    "coa.children": "Sub-Accounts",
    "coa.create": "Create Account",
    "coa.edit": "Edit Account",
    "coa.delete": "Delete Account",
    "coa.activate": "Activate",
    "coa.deactivate": "Deactivate",
    "coa.saving": "Saving...",
    "coa.deleting": "Deleting...",
    "coa.confirmDelete": "Are you sure you want to delete this account?",
    "coa.confirmDelete.desc": "This action cannot be undone. Accounts with transactions cannot be deleted.",
    "coa.type.ASSET": "Asset",
    "coa.type.LIABILITY": "Liability",
    "coa.type.EQUITY": "Equity",
    "coa.type.REVENUE": "Revenue",
    "coa.type.EXPENSE": "Expense",
    "coa.nature.DEBIT": "Debit",
    "coa.nature.CREDIT": "Credit",
    "coa.badge.group": "Group",
    "coa.badge.leaf": "Posting",
    "coa.badge.active": "Active",
    "coa.badge.inactive": "Inactive",
    "coa.empty": "No accounts found",
    "coa.empty.desc": "Get started by creating your first account",
    "coa.empty.search": "No accounts match your search",
    "coa.detail.title": "Account Details",
    "coa.detail.back": "Back to Chart of Accounts",
    "coa.detail.info": "Account Information",
    "coa.detail.subAccounts": "Sub-Accounts",
    "coa.detail.noChildren": "This account has no sub-accounts",
    "coa.nextCode.hint": "Suggested next code",
    "coa.nature.auto": "Auto-derived from account type",
    "common.loading": "Loading...",
    "common.error": "An error occurred.",
    "common.success": "Operation successful.",
    "common.noData": "No data available.",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.confirm": "Confirm",
    "common.actions": "Actions",
    "common.yes": "Yes",
    "common.no": "No"
  },
  ar: {
    "app.name": "منظومة مانز",
    "nav.dashboard": "لوحة القيادة",
    "nav.organizations": "المنظمات",
    "nav.accounting": "المحاسبة",
    "nav.chartOfAccounts": "دليل الحسابات",
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
    "coa.title": "دليل الحسابات",
    "coa.subtitle": "إدارة هيكل الحسابات في مؤسستك",
    "coa.new": "حساب جديد",
    "coa.search": "البحث عن حساب...",
    "coa.filter.type": "نوع الحساب",
    "coa.filter.status": "الحالة",
    "coa.filter.all": "الكل",
    "coa.expandAll": "توسيع الكل",
    "coa.collapseAll": "طي الكل",
    "coa.treeView": "عرض الشجرة",
    "coa.listView": "عرض القائمة",
    "coa.code": "رمز الحساب",
    "coa.nameEn": "الاسم (إنجليزي)",
    "coa.nameAr": "الاسم (عربي)",
    "coa.type": "نوع الحساب",
    "coa.nature": "طبيعة الحساب",
    "coa.parent": "الحساب الأصلي",
    "coa.parent.none": "بدون (مستوى أول)",
    "coa.isGroup": "حساب تجميعي",
    "coa.isGroup.desc": "الحسابات التجميعية لا تقبل القيود مباشرةً",
    "coa.level": "المستوى",
    "coa.isActive": "نشط",
    "coa.allowDirectEntry": "يقبل قيود مباشرة",
    "coa.notes": "ملاحظات",
    "coa.currency": "العملة",
    "coa.transactionCount": "عدد القيود",
    "coa.children": "الحسابات الفرعية",
    "coa.create": "إنشاء حساب",
    "coa.edit": "تعديل الحساب",
    "coa.delete": "حذف الحساب",
    "coa.activate": "تفعيل",
    "coa.deactivate": "تعطيل",
    "coa.saving": "جاري الحفظ...",
    "coa.deleting": "جاري الحذف...",
    "coa.confirmDelete": "هل أنت متأكد من حذف هذا الحساب؟",
    "coa.confirmDelete.desc": "لا يمكن التراجع عن هذا الإجراء. لا يمكن حذف الحسابات التي لها قيود.",
    "coa.type.ASSET": "أصول",
    "coa.type.LIABILITY": "التزامات",
    "coa.type.EQUITY": "حقوق الملكية",
    "coa.type.REVENUE": "إيرادات",
    "coa.type.EXPENSE": "مصروفات",
    "coa.nature.DEBIT": "مدين",
    "coa.nature.CREDIT": "دائن",
    "coa.badge.group": "تجميعي",
    "coa.badge.leaf": "ترحيل",
    "coa.badge.active": "نشط",
    "coa.badge.inactive": "غير نشط",
    "coa.empty": "لا توجد حسابات",
    "coa.empty.desc": "ابدأ بإنشاء أول حساب",
    "coa.empty.search": "لا توجد حسابات تطابق بحثك",
    "coa.detail.title": "تفاصيل الحساب",
    "coa.detail.back": "العودة إلى دليل الحسابات",
    "coa.detail.info": "معلومات الحساب",
    "coa.detail.subAccounts": "الحسابات الفرعية",
    "coa.detail.noChildren": "هذا الحساب لا يحتوي على حسابات فرعية",
    "coa.nextCode.hint": "الرمز المقترح التالي",
    "coa.nature.auto": "يُحدد تلقائياً حسب نوع الحساب",
    "common.loading": "جاري التحميل...",
    "common.error": "حدث خطأ.",
    "common.success": "تمت العملية بنجاح.",
    "common.noData": "لا توجد بيانات متاحة.",
    "common.cancel": "إلغاء",
    "common.save": "حفظ",
    "common.delete": "حذف",
    "common.edit": "تعديل",
    "common.confirm": "تأكيد",
    "common.actions": "الإجراءات",
    "common.yes": "نعم",
    "common.no": "لا"
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
