import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider, useLanguage } from "@/lib/language-provider";
import { ThemeProvider } from "@/components/theme-provider";

import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Organizations from "@/pages/Organizations";
import NewOrganization from "@/pages/NewOrganization";
import Settings from "@/pages/Settings";
import ChartOfAccounts from "@/pages/ChartOfAccounts";
import ChartOfAccountDetail from "@/pages/ChartOfAccountDetail";
import JournalEntries from "@/pages/JournalEntries";
import JournalEntryDetail from "@/pages/JournalEntryDetail";
import JournalEntryForm from "@/pages/JournalEntryForm";
import BankAccounts from "@/pages/BankAccounts";
import BankAccountForm from "@/pages/BankAccountForm";
import BankAccountDetail from "@/pages/BankAccountDetail";
import NotFound from "@/pages/not-found";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "hsl(243 75% 45%)",
    fontFamily: "'Inter', 'Noto Sans Arabic', sans-serif",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border border-border/50 shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none bg-muted/30",
  },
};

function SignInPage() {
  const { lang, dir } = useLanguage();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-muted/20 px-4" dir={dir}>
      <div className="mb-8 flex flex-col items-center">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-sm mb-4">
          M
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {lang === 'ar' ? 'تسجيل الدخول' : 'Sign in to Mans ERP'}
        </h1>
      </div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  const { lang, dir } = useLanguage();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-muted/20 px-4" dir={dir}>
      <div className="mb-8 flex flex-col items-center">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl shadow-sm mb-4">
          M
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {lang === 'ar' ? 'إنشاء حساب جديد' : 'Create an account'}
        </h1>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoaded, isSignedIn } = useAuth();
  
  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  
  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          <Route path="/dashboard">
            <ProtectedRoute component={Dashboard} />
          </Route>
          <Route path="/organizations">
            <ProtectedRoute component={Organizations} />
          </Route>
          <Route path="/organizations/new">
            <ProtectedRoute component={NewOrganization} />
          </Route>
          <Route path="/settings">
            <ProtectedRoute component={Settings} />
          </Route>
          <Route path="/chart-of-accounts">
            <ProtectedRoute component={ChartOfAccounts} />
          </Route>
          <Route path="/chart-of-accounts/:id">
            {(params) => (
              <DashboardLayout>
                <ChartOfAccountDetail params={params as { id: string }} />
              </DashboardLayout>
            )}
          </Route>
          <Route path="/journal-entries">
            <ProtectedRoute component={JournalEntries} />
          </Route>
          <Route path="/journal-entries/new">
            <ProtectedRoute component={JournalEntryForm} />
          </Route>
          <Route path="/journal-entries/:id/edit">
            {(params) => (
              <DashboardLayout>
                <JournalEntryForm params={params as { id: string }} />
              </DashboardLayout>
            )}
          </Route>
          <Route path="/journal-entries/:id">
            {(params) => (
              <DashboardLayout>
                <JournalEntryDetail params={params as { id: string }} />
              </DashboardLayout>
            )}
          </Route>

          <Route path="/bank-accounts">
            <ProtectedRoute component={BankAccounts} />
          </Route>
          <Route path="/bank-accounts/new">
            <ProtectedRoute component={BankAccountForm} />
          </Route>
          <Route path="/bank-accounts/:id/edit">
            {(params) => (
              <DashboardLayout>
                <BankAccountForm params={params as { id: string }} />
              </DashboardLayout>
            )}
          </Route>
          <Route path="/bank-accounts/:id">
            {(params) => (
              <DashboardLayout>
                <BankAccountDetail params={params as { id: string }} />
              </DashboardLayout>
            )}
          </Route>
          
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="mans-erp-theme">
      <LanguageProvider>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <ClerkProviderWithRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
