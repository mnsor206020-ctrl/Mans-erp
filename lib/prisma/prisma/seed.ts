import { PrismaClient, AccountType, AccountNature, OrganizationType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Mans ERP database...");

  // ── Currencies ───────────────────────────────────────────────
  console.log("  → Currencies");
  await prisma.currency.createMany({
    skipDuplicates: true,
    data: [
      { code: "SAR", nameEn: "Saudi Riyal",       nameAr: "ريال سعودي",       symbol: "ر.س",  isBase: true,  decimalPlaces: 2 },
      { code: "USD", nameEn: "US Dollar",          nameAr: "دولار أمريكي",     symbol: "$",    isBase: false, decimalPlaces: 2 },
      { code: "EUR", nameEn: "Euro",               nameAr: "يورو",             symbol: "€",    isBase: false, decimalPlaces: 2 },
      { code: "GBP", nameEn: "British Pound",      nameAr: "جنيه إسترليني",    symbol: "£",    isBase: false, decimalPlaces: 2 },
      { code: "AED", nameEn: "UAE Dirham",         nameAr: "درهم إماراتي",     symbol: "د.إ",  isBase: false, decimalPlaces: 2 },
      { code: "KWD", nameEn: "Kuwaiti Dinar",      nameAr: "دينار كويتي",      symbol: "د.ك",  isBase: false, decimalPlaces: 3 },
      { code: "BHD", nameEn: "Bahraini Dinar",     nameAr: "دينار بحريني",     symbol: "د.ب",  isBase: false, decimalPlaces: 3 },
      { code: "OMR", nameEn: "Omani Rial",         nameAr: "ريال عماني",       symbol: "ر.ع",  isBase: false, decimalPlaces: 3 },
      { code: "QAR", nameEn: "Qatari Riyal",       nameAr: "ريال قطري",        symbol: "ر.ق",  isBase: false, decimalPlaces: 2 },
      { code: "JOD", nameEn: "Jordanian Dinar",    nameAr: "دينار أردني",      symbol: "د.أ",  isBase: false, decimalPlaces: 3 },
      { code: "EGP", nameEn: "Egyptian Pound",     nameAr: "جنيه مصري",        symbol: "ج.م",  isBase: false, decimalPlaces: 2 },
    ],
  });

  // ── Exchange rates (base rates relative to SAR) ───────────────
  console.log("  → Exchange rates");
  await prisma.exchangeRate.createMany({
    skipDuplicates: true,
    data: [
      { currencyCode: "USD", rate: 3.7500,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "EUR", rate: 4.0500,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "GBP", rate: 4.7000,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "AED", rate: 1.0200,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "KWD", rate: 12.2000, rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "BHD", rate: 9.9500,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "OMR", rate: 9.7500,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "QAR", rate: 1.0300,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "JOD", rate: 5.3000,  rateDate: new Date("2026-01-01"), source: "SAMA" },
      { currencyCode: "EGP", rate: 0.0770,  rateDate: new Date("2026-01-01"), source: "SAMA" },
    ],
  });

  // ── Saudi Banks ───────────────────────────────────────────────
  console.log("  → Banks");
  await prisma.bank.createMany({
    skipDuplicates: true,
    data: [
      { nameEn: "Al Rajhi Bank",                    nameAr: "مصرف الراجحي",                     swiftCode: "RJHISARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Saudi National Bank (SNB)",         nameAr: "البنك الأهلي السعودي",              swiftCode: "NCBKSAJE", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Riyad Bank",                        nameAr: "بنك الرياض",                       swiftCode: "RIBLSARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Banque Saudi Fransi",               nameAr: "البنك السعودي الفرنسي",             swiftCode: "BSFRSARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Arab National Bank (ANB)",          nameAr: "البنك العربي الوطني",               swiftCode: "ARNBSARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Saudi British Bank (SABB)",         nameAr: "البنك السعودي البريطاني",           swiftCode: "SABBSARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Alinma Bank",                       nameAr: "مصرف الإنماء",                     swiftCode: "INMASARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Bank AlJazira",                     nameAr: "بنك الجزيرة",                      swiftCode: "BJAZSARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Bank Albilad",                      nameAr: "بنك البلاد",                       swiftCode: "ALBISARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Saudi Awwal Bank (SAB)",            nameAr: "البنك السعودي الأول",               swiftCode: "SABBSARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Gulf International Bank (GIB)",     nameAr: "بنك الخليج الدولي",                swiftCode: "GULFSARI", ibanPrefix: "SA", country: "SA" },
      { nameEn: "Saudi Investment Bank (SAIB)",      nameAr: "البنك السعودي للاستثمار",           swiftCode: "SIBCSARI", ibanPrefix: "SA", country: "SA" },
    ],
  });

  // ── System Roles ──────────────────────────────────────────────
  console.log("  → System roles");
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { id: "00000000-0000-0000-0000-000000000001" },
      create: { id: "00000000-0000-0000-0000-000000000001", nameEn: "Super Admin",    nameAr: "مدير النظام",        isSystem: true },
      update: {},
    }),
    prisma.role.upsert({
      where: { id: "00000000-0000-0000-0000-000000000002" },
      create: { id: "00000000-0000-0000-0000-000000000002", nameEn: "Organization Admin", nameAr: "مدير المؤسسة",   isSystem: true },
      update: {},
    }),
    prisma.role.upsert({
      where: { id: "00000000-0000-0000-0000-000000000003" },
      create: { id: "00000000-0000-0000-0000-000000000003", nameEn: "Accountant",     nameAr: "محاسب",             isSystem: true },
      update: {},
    }),
    prisma.role.upsert({
      where: { id: "00000000-0000-0000-0000-000000000004" },
      create: { id: "00000000-0000-0000-0000-000000000004", nameEn: "Branch Manager", nameAr: "مدير الفرع",        isSystem: true },
      update: {},
    }),
    prisma.role.upsert({
      where: { id: "00000000-0000-0000-0000-000000000005" },
      create: { id: "00000000-0000-0000-0000-000000000005", nameEn: "Viewer",         nameAr: "مشاهد",             isSystem: true },
      update: {},
    }),
    prisma.role.upsert({
      where: { id: "00000000-0000-0000-0000-000000000006" },
      create: { id: "00000000-0000-0000-0000-000000000006", nameEn: "Auditor",        nameAr: "مراجع الحسابات",    isSystem: true },
      update: {},
    }),
  ]);
  console.log(`     Created ${roles.length} system roles`);

  // ── Permissions ───────────────────────────────────────────────
  console.log("  → Permissions");
  const resources = [
    "organizations", "branches", "users", "roles",
    "fiscal_years", "chart_of_accounts", "cost_centers",
    "journal_entries", "currencies", "exchange_rates",
    "banks", "bank_accounts", "cash_boxes",
    "receipts", "payments", "petty_cash",
    "attachments", "audit_logs", "reports",
  ];
  const actions = ["create", "read", "update", "delete", "export", "approve", "void"];

  const permissionData = resources.flatMap((resource) =>
    actions.map((action) => ({ resource, action }))
  );

  await prisma.permission.createMany({ skipDuplicates: true, data: permissionData });

  const allPermissions = await prisma.permission.findMany();
  console.log(`     Created ${allPermissions.length} permissions`);

  // Assign ALL permissions to Super Admin
  const superAdminRole = roles[0];
  await prisma.rolePermission.createMany({
    skipDuplicates: true,
    data: allPermissions.map((p) => ({ roleId: superAdminRole.id, permissionId: p.id })),
  });

  // Assign read-only permissions to Viewer
  const viewerRole = roles[4];
  const readPerms = allPermissions.filter((p) => p.action === "read");
  await prisma.rolePermission.createMany({
    skipDuplicates: true,
    data: readPerms.map((p) => ({ roleId: viewerRole.id, permissionId: p.id })),
  });

  // Assign accounting-related permissions to Accountant
  const accountantRole = roles[2];
  const accountantResources = [
    "chart_of_accounts", "cost_centers", "journal_entries",
    "currencies", "exchange_rates", "bank_accounts", "cash_boxes",
    "receipts", "payments", "petty_cash", "attachments", "reports",
  ];
  const accountantPerms = allPermissions.filter(
    (p) => accountantResources.includes(p.resource) && p.action !== "delete"
  );
  await prisma.rolePermission.createMany({
    skipDuplicates: true,
    data: accountantPerms.map((p) => ({ roleId: accountantRole.id, permissionId: p.id })),
  });

  // Assign read + export to Auditor
  const auditorRole = roles[5];
  const auditorPerms = allPermissions.filter(
    (p) => ["read", "export"].includes(p.action)
  );
  await prisma.rolePermission.createMany({
    skipDuplicates: true,
    data: auditorPerms.map((p) => ({ roleId: auditorRole.id, permissionId: p.id })),
  });

  // ── Demo Organization ─────────────────────────────────────────
  console.log("  → Demo organization");
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    create: {
      id:                 "00000000-0000-0000-0000-000000000010",
      nameEn:             "Al-Birr Charity Association",
      nameAr:             "جمعية البر الخيرية",
      type:               OrganizationType.CHARITY,
      registrationNumber: "SA-001-2020",
      email:              "info@albirr.org.sa",
      phone:              "+966-11-4556789",
      city:               "الرياض",
      country:            "SA",
      baseCurrencyCode:   "SAR",
    },
    update: {},
  });

  // ── Head Branch ───────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: "00000000-0000-0000-0000-000000000020" },
    create: {
      id:             "00000000-0000-0000-0000-000000000020",
      organizationId: org.id,
      nameEn:         "Head Office",
      nameAr:         "المركز الرئيسي",
      code:           "HQ",
      city:           "الرياض",
      isHeadquarters: true,
    },
    update: {},
  });

  // ── Fiscal Year ───────────────────────────────────────────────
  await prisma.fiscalYear.upsert({
    where: { id: "00000000-0000-0000-0000-000000000030" },
    create: {
      id:             "00000000-0000-0000-0000-000000000030",
      organizationId: org.id,
      nameEn:         "Fiscal Year 2026",
      nameAr:         "السنة المالية 2026",
      startDate:      new Date("2026-01-01"),
      endDate:        new Date("2026-12-31"),
      isDefault:      true,
      status:         "OPEN",
    },
    update: {},
  });

  // ── Chart of Accounts (Standard Saudi Nonprofit COA) ─────────
  console.log("  → Chart of accounts");
  const coa = [
    // Assets (1xxx)
    { code: "1000", nameEn: "Assets",                      nameAr: "الأصول",                    type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: true,  level: 1 },
    { code: "1100", nameEn: "Current Assets",              nameAr: "الأصول المتداولة",           type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: true,  level: 2, parentCode: "1000" },
    { code: "1110", nameEn: "Cash on Hand",                nameAr: "النقد بالصندوق",             type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "1100" },
    { code: "1120", nameEn: "Cash at Banks",               nameAr: "النقد في البنوك",            type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "1100" },
    { code: "1130", nameEn: "Petty Cash",                  nameAr: "المصروفات النثرية",          type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "1100" },
    { code: "1140", nameEn: "Accounts Receivable",         nameAr: "الذمم المدينة",              type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "1100" },
    { code: "1150", nameEn: "Prepaid Expenses",            nameAr: "المصروفات المدفوعة مسبقاً", type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "1100" },
    { code: "1200", nameEn: "Non-Current Assets",          nameAr: "الأصول غير المتداولة",      type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: true,  level: 2, parentCode: "1000" },
    { code: "1210", nameEn: "Fixed Assets",                nameAr: "الأصول الثابتة",             type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: true,  level: 3, parentCode: "1200" },
    { code: "1211", nameEn: "Land & Buildings",            nameAr: "الأراضي والمباني",           type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 4, parentCode: "1210" },
    { code: "1212", nameEn: "Furniture & Fixtures",        nameAr: "الأثاث والتجهيزات",         type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 4, parentCode: "1210" },
    { code: "1213", nameEn: "Vehicles",                    nameAr: "المركبات",                   type: AccountType.ASSET,     nature: AccountNature.DEBIT,  isGroup: false, level: 4, parentCode: "1210" },
    { code: "1214", nameEn: "Accumulated Depreciation",   nameAr: "مجمع الاستهلاك",             type: AccountType.ASSET,     nature: AccountNature.CREDIT, isGroup: false, level: 4, parentCode: "1210" },
    // Liabilities (2xxx)
    { code: "2000", nameEn: "Liabilities",                 nameAr: "الالتزامات",                 type: AccountType.LIABILITY, nature: AccountNature.CREDIT, isGroup: true,  level: 1 },
    { code: "2100", nameEn: "Current Liabilities",         nameAr: "الالتزامات المتداولة",       type: AccountType.LIABILITY, nature: AccountNature.CREDIT, isGroup: true,  level: 2, parentCode: "2000" },
    { code: "2110", nameEn: "Accounts Payable",            nameAr: "الذمم الدائنة",              type: AccountType.LIABILITY, nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "2100" },
    { code: "2120", nameEn: "Accrued Expenses",            nameAr: "المصروفات المستحقة",         type: AccountType.LIABILITY, nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "2100" },
    { code: "2130", nameEn: "Zakat & Tax Payable",         nameAr: "الزكاة والضرائب المستحقة",   type: AccountType.LIABILITY, nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "2100" },
    { code: "2200", nameEn: "Non-Current Liabilities",     nameAr: "الالتزامات غير المتداولة",  type: AccountType.LIABILITY, nature: AccountNature.CREDIT, isGroup: true,  level: 2, parentCode: "2000" },
    { code: "2210", nameEn: "Long-term Loans",             nameAr: "القروض طويلة الأجل",         type: AccountType.LIABILITY, nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "2200" },
    // Equity (3xxx)
    { code: "3000", nameEn: "Equity / Net Assets",         nameAr: "حقوق الملكية / صافي الأصول", type: AccountType.EQUITY,    nature: AccountNature.CREDIT, isGroup: true,  level: 1 },
    { code: "3100", nameEn: "Endowment Fund",              nameAr: "رأس مال الوقف",              type: AccountType.EQUITY,    nature: AccountNature.CREDIT, isGroup: false, level: 2, parentCode: "3000" },
    { code: "3200", nameEn: "Unrestricted Net Assets",     nameAr: "صافي أصول غير مقيدة",       type: AccountType.EQUITY,    nature: AccountNature.CREDIT, isGroup: false, level: 2, parentCode: "3000" },
    { code: "3300", nameEn: "Restricted Net Assets",       nameAr: "صافي أصول مقيدة",           type: AccountType.EQUITY,    nature: AccountNature.CREDIT, isGroup: false, level: 2, parentCode: "3000" },
    { code: "3400", nameEn: "Retained Surplus / Deficit",  nameAr: "الفائض / العجز المرحّل",     type: AccountType.EQUITY,    nature: AccountNature.CREDIT, isGroup: false, level: 2, parentCode: "3000" },
    // Revenue (4xxx)
    { code: "4000", nameEn: "Revenue",                     nameAr: "الإيرادات",                  type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: true,  level: 1 },
    { code: "4100", nameEn: "Donations & Grants",          nameAr: "التبرعات والمنح",             type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: true,  level: 2, parentCode: "4000" },
    { code: "4110", nameEn: "Public Donations",            nameAr: "التبرعات العامة",             type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "4100" },
    { code: "4120", nameEn: "Corporate Sponsorships",      nameAr: "الرعاية المؤسسية",            type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "4100" },
    { code: "4130", nameEn: "Government Grants",           nameAr: "المنح الحكومية",              type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "4100" },
    { code: "4140", nameEn: "Zakat Receipts",              nameAr: "إيرادات الزكاة",              type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: false, level: 3, parentCode: "4100" },
    { code: "4200", nameEn: "Investment Income",           nameAr: "إيرادات الاستثمار",           type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: false, level: 2, parentCode: "4000" },
    { code: "4300", nameEn: "Program Revenue",             nameAr: "إيرادات البرامج",             type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: false, level: 2, parentCode: "4000" },
    { code: "4400", nameEn: "Membership Fees",             nameAr: "رسوم العضوية",                type: AccountType.REVENUE,   nature: AccountNature.CREDIT, isGroup: false, level: 2, parentCode: "4000" },
    // Expenses (5xxx)
    { code: "5000", nameEn: "Expenses",                    nameAr: "المصروفات",                   type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: true,  level: 1 },
    { code: "5100", nameEn: "Program Expenses",            nameAr: "مصروفات البرامج",             type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: true,  level: 2, parentCode: "5000" },
    { code: "5110", nameEn: "Beneficiary Aid",             nameAr: "إعانات المستفيدين",           type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5100" },
    { code: "5120", nameEn: "Project Costs",               nameAr: "تكاليف المشاريع",             type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5100" },
    { code: "5130", nameEn: "Volunteer Expenses",          nameAr: "مصروفات المتطوعين",           type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5100" },
    { code: "5200", nameEn: "Administrative Expenses",     nameAr: "المصروفات الإدارية",          type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: true,  level: 2, parentCode: "5000" },
    { code: "5210", nameEn: "Salaries & Wages",            nameAr: "الرواتب والأجور",             type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5200" },
    { code: "5220", nameEn: "Rent & Utilities",            nameAr: "الإيجار والمرافق",            type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5200" },
    { code: "5230", nameEn: "Office Supplies",             nameAr: "مستلزمات المكتب",             type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5200" },
    { code: "5240", nameEn: "Transportation",              nameAr: "المواصلات",                   type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5200" },
    { code: "5250", nameEn: "Communication",               nameAr: "الاتصالات",                   type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 3, parentCode: "5200" },
    { code: "5300", nameEn: "Fundraising Expenses",        nameAr: "مصروفات جمع التبرعات",        type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 2, parentCode: "5000" },
    { code: "5400", nameEn: "Depreciation",                nameAr: "الاستهلاك",                   type: AccountType.EXPENSE,   nature: AccountNature.DEBIT,  isGroup: false, level: 2, parentCode: "5000" },
  ];

  // Build a lookup map for parent codes → IDs
  const accountIdMap: Record<string, string> = {};

  for (const account of coa) {
    const parentId = account.parentCode ? accountIdMap[account.parentCode] : undefined;
    const created = await prisma.chartOfAccount.upsert({
      where: { organizationId_code: { organizationId: org.id, code: account.code } },
      create: {
        organizationId:    org.id,
        parentId:          parentId ?? null,
        code:              account.code,
        nameEn:            account.nameEn,
        nameAr:            account.nameAr,
        type:              account.type,
        nature:            account.nature,
        level:             account.level,
        isGroup:           account.isGroup,
        allowDirectEntry:  !account.isGroup,
      },
      update: {},
    });
    accountIdMap[account.code] = created.id;
  }
  console.log(`     Created ${coa.length} chart of accounts entries`);

  // ── Cost Centers ──────────────────────────────────────────────
  console.log("  → Cost centers");
  const costCenterData = [
    { code: "CC-00", nameEn: "General",              nameAr: "عام",                  parentCode: null },
    { code: "CC-01", nameEn: "Programs & Projects",  nameAr: "البرامج والمشاريع",    parentCode: null },
    { code: "CC-01-01", nameEn: "Humanitarian Aid",  nameAr: "المساعدات الإنسانية",  parentCode: "CC-01" },
    { code: "CC-01-02", nameEn: "Education",         nameAr: "التعليم",              parentCode: "CC-01" },
    { code: "CC-01-03", nameEn: "Healthcare",        nameAr: "الرعاية الصحية",       parentCode: "CC-01" },
    { code: "CC-01-04", nameEn: "Housing",           nameAr: "الإسكان",              parentCode: "CC-01" },
    { code: "CC-02", nameEn: "Administration",       nameAr: "الإدارة",              parentCode: null },
    { code: "CC-03", nameEn: "Fundraising",          nameAr: "جمع التبرعات",          parentCode: null },
  ];
  const ccIdMap: Record<string, string> = {};
  for (const cc of costCenterData) {
    const parentId = cc.parentCode ? ccIdMap[cc.parentCode] : undefined;
    const created = await prisma.costCenter.upsert({
      where: { organizationId_code: { organizationId: org.id, code: cc.code } },
      create: {
        organizationId: org.id,
        parentId:       parentId ?? null,
        code:           cc.code,
        nameEn:         cc.nameEn,
        nameAr:         cc.nameAr,
      },
      update: {},
    });
    ccIdMap[cc.code] = created.id;
  }
  console.log(`     Created ${costCenterData.length} cost centers`);

  // ── Audit log: seed ───────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      action:      "CREATE",
      entityType:  "system",
      description: "Database seeded with initial reference data",
    },
  });

  console.log("✅  Seeding complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
