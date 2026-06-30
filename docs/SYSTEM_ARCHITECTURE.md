# Mans ERP — System Architecture

---

## Overview

Mans ERP is a **cloud-based, multi-tenant-ready ERP** built as a pnpm monorepo. The architecture separates concerns across packages: a React single-page application (SPA) on the frontend, an Express REST API server on the backend, and a shared library layer for the database client, API contracts, and generated code.

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (User)                        │
│                                                          │
│   React SPA  (/  →  dashboard / organizations / …)      │
│   Clerk.js   (auth UI embedded via /clerk proxy)         │
└────────────────────────────┬────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Replit Proxy (mTLS)                         │
│         Routes by path prefix                            │
│                                                          │
│   /           → Vite dev server  (port 22565)            │
│   /api/*      → Express server   (port 8080)             │
│   /clerk/*    → Clerk.com API    (proxied by Express)    │
└────────────────────────────┬────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────┐      ┌─────────────────────────┐
│   Express API        │      │   Clerk (auth provider)  │
│   (api-server)       │      │   Replit-managed tenant  │
│                      │      │   Dev & Prod separated   │
│   Routes:            │      └─────────────────────────┘
│   /api/healthz       │
│   /api/dashboard/*   │      ┌─────────────────────────┐
│   /api/organizations │      │   PostgreSQL             │
│   /api/users/*       │◄────►│   (Replit managed)       │
│                      │      │   Prisma ORM             │
│   Middleware:        │      └─────────────────────────┘
│   - pinoHttp logging │
│   - Clerk proxy      │
│   - clerkMiddleware  │
│   - CORS             │
└─────────────────────┘
```

---

## Monorepo Structure

```
workspace/
├── artifacts/
│   ├── mans-erp/               # React + Vite frontend (SPA)
│   │   ├── src/
│   │   │   ├── App.tsx         # Router, Clerk provider, Query client
│   │   │   ├── main.tsx        # Entry point
│   │   │   ├── index.css       # Global styles, theme variables, fonts
│   │   │   ├── pages/          # Route-level page components
│   │   │   ├── components/
│   │   │   │   ├── layout/     # DashboardLayout, Sidebar, Header
│   │   │   │   └── ui/         # shadcn/ui component library (50+ components)
│   │   │   ├── lib/
│   │   │   │   ├── language-provider.tsx   # AR/EN RTL context
│   │   │   │   └── utils.ts                # cn() helper
│   │   │   └── hooks/          # use-toast, use-mobile
│   │   ├── vite.config.ts
│   │   └── package.json        # @workspace/mans-erp
│   │
│   ├── api-server/             # Express REST API
│   │   ├── src/
│   │   │   ├── app.ts          # Express app, middleware stack
│   │   │   ├── index.ts        # Server entry point (PORT binding)
│   │   │   ├── routes/
│   │   │   │   ├── index.ts    # Route registration
│   │   │   │   ├── health.ts   # GET /api/healthz
│   │   │   │   ├── dashboard.ts  # GET /api/dashboard/stats|activity
│   │   │   │   ├── organizations.ts
│   │   │   │   └── users.ts
│   │   │   ├── middlewares/
│   │   │   │   └── clerkProxyMiddleware.ts
│   │   │   └── lib/
│   │   │       └── logger.ts   # pino structured logger
│   │   ├── build.mjs           # esbuild bundle script
│   │   └── package.json        # @workspace/api-server
│   │
│   └── mockup-sandbox/         # Design canvas preview server
│
├── lib/
│   ├── api-spec/               # OpenAPI contract (source of truth)
│   │   ├── openapi.yaml        # API specification
│   │   └── orval.config.ts     # Code generation config
│   │
│   ├── api-client-react/       # Generated TanStack Query hooks
│   │   └── src/
│   │       ├── generated/api.ts         # All hooks (useGetDashboardStats, etc.)
│   │       └── custom-fetch.ts          # Fetch wrapper with auth headers
│   │
│   ├── api-zod/                # Generated Zod validators
│   │   └── src/
│   │       └── generated/api.ts         # Zod schemas per endpoint
│   │
│   ├── prisma/                 # Database client package
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # 22-table Prisma schema (source of truth)
│   │   │   └── seed.ts         # Reference data seed script
│   │   └── src/
│   │       └── index.ts        # Singleton PrismaClient export
│   │
│   └── db/                     # Legacy Drizzle package (deprecated, tables dropped)
│
├── docs/                       # Project documentation
├── pnpm-workspace.yaml         # Workspace config, catalog versions, security
├── tsconfig.base.json          # Shared TypeScript config
└── package.json                # Root workspace
```

---

## Package Dependency Graph

```
mans-erp (frontend)
  ├── @workspace/api-client-react   (generated hooks)
  ├── @clerk/react                  (auth UI)
  ├── @clerk/themes                 (Clerk appearance)
  ├── next-themes                   (dark/light mode)
  └── wouter                        (SPA router)

api-server (backend)
  ├── @workspace/prisma             (DB client)
  ├── @workspace/api-zod            (request validation)
  ├── @clerk/express                (auth middleware)
  └── express                       (HTTP server)

api-client-react (generated)
  └── @workspace/api-spec           (OpenAPI source)

api-zod (generated)
  └── @workspace/api-spec           (OpenAPI source)

prisma (db)
  └── @prisma/client                (Prisma engine)
```

---

## Request Lifecycle

### Authenticated API Request

```
1. Browser: useGetDashboardStats() hook fires
2. custom-fetch.ts: Attaches Clerk JWT as "Authorization: Bearer <token>"
3. Replit proxy: Routes /api/* to Express on :8080
4. Express: pinoHttp logs request
5. Express: clerkMiddleware() validates JWT via Clerk SDK
6. Express: requireAuth() guard — rejects with 401 if invalid
7. Route handler: Queries PostgreSQL via prisma client
8. Prisma: Executes parameterized SQL
9. Handler: Returns JSON response
10. TanStack Query: Caches result, re-renders component
```

### Auth Flow

```
1. User visits /sign-in
2. Clerk.js loads from /clerk/* proxy (Clerk CDN traffic proxied by Express)
3. User enters credentials → Clerk issues session JWT
4. ClerkProvider makes JWT available via useAuth() hook
5. custom-fetch.ts reads token with getToken() on every API call
6. On sign-out: queryClient.clear() flushes all cached API data
```

---

## Authentication Architecture

Mans ERP uses **Replit-managed Clerk** with two isolated environments:

| Environment | Keys | User Store |
|---|---|---|
| Development | `pk_test_*` | Dev-only users |
| Production | `pk_live_*` | Production users |

The Clerk JS SDK is proxied through Express at `/clerk/*`. This allows:
- Custom domain support without CORS issues
- Single origin for all traffic (no third-party cookie issues)
- Clerk publishable key resolved dynamically per request host

---

## Frontend Architecture

### Routing (wouter)

```
/                  → Home.tsx          (public)
/sign-in/*?        → SignInPage        (Clerk <SignIn />)
/sign-up/*?        → SignUpPage        (Clerk <SignUp />)
/dashboard         → Dashboard.tsx     (protected)
/organizations     → Organizations.tsx (protected)
/organizations/new → NewOrganization.tsx (protected)
/settings          → Settings.tsx      (protected)
```

Protected routes: Wrapped in `<ProtectedRoute>` which checks `isLoaded && isSignedIn`. If not signed in, redirects to `/sign-in`.

### State Management

| Concern | Solution |
|---|---|
| Server state | TanStack Query v5 (via generated Orval hooks) |
| Auth state | Clerk (`useAuth`, `useUser`) |
| UI theme | next-themes (`useTheme`) |
| Language/RTL | Custom `LanguageContext` (localStorage-persisted) |
| Form state | react-hook-form + zod resolver |
| Toast notifications | shadcn/ui toast system |

### Component Library

All UI components come from **shadcn/ui** — unstyled Radix UI primitives styled with Tailwind CSS. Components live in `src/components/ui/` and are owned by the project (not a dependency). Customization is done directly in the component files.

---

## Backend Architecture

### Middleware Stack (in order)

```typescript
app.use(pinoHttp)              // 1. Structured request logging
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware())  // 2. Clerk JS proxy
app.use(cors({ credentials: true, origin: true })) // 3. CORS
app.use(express.json())        // 4. JSON body parsing
app.use(express.urlencoded())  // 5. Form body parsing
app.use(clerkMiddleware())     // 6. JWT validation (attaches auth to req)
app.use('/api', router)        // 7. Route handlers
```

### Route Structure

```
GET  /api/healthz
GET  /api/dashboard/stats
GET  /api/dashboard/activity
GET  /api/organizations
POST /api/organizations
GET  /api/organizations/:id
PATCH /api/organizations/:id
GET  /api/users/me
PATCH /api/users/me
GET  /api/users
```

---

## Database Architecture

See `docs/DATABASE_DESIGN.md` for full schema documentation.

| Layer | Technology |
|---|---|
| Database | PostgreSQL (Replit-managed, heliumdb) |
| ORM | Prisma 6 |
| Schema source | `lib/prisma/prisma/schema.prisma` |
| Client package | `@workspace/prisma` |
| Migrations | `prisma db push` (dev) / `prisma migrate deploy` (prod) |
| Seed | `lib/prisma/prisma/seed.ts` |

---

## Code Generation Pipeline

The API contract is **OpenAPI-first**. The source of truth is `lib/api-spec/openapi.yaml`. Derived artifacts are **never edited manually**.

```
openapi.yaml
    │
    └── orval codegen
            ├── lib/api-client-react/src/generated/api.ts
            │       └── TanStack Query hooks (useGetDashboardStats, etc.)
            └── lib/api-zod/src/generated/api.ts
                    └── Zod request/response validators
```

**After every change to `openapi.yaml`:**
```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Internationalization & RTL

Mans ERP is bilingual from the ground up.

| Concern | Implementation |
|---|---|
| Language state | `LanguageContext` — provides `lang: "ar" \| "en"` and `dir: "rtl" \| "ltr"` |
| Persistence | `localStorage` key `mans-erp-lang` |
| HTML direction | `dir` attribute applied to root wrapper |
| CSS | Tailwind `rtl:` and `ltr:` variants for directional spacing |
| Arabic font | Noto Sans Arabic (Google Fonts, imported first in index.css) |
| English font | Inter (Google Fonts) |
| Data | All entities carry `nameEn` + `nameAr` fields |

---

## Environment Variables

| Variable | Where Used | Description |
|---|---|---|
| `DATABASE_URL` | api-server, prisma | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | api-server | Clerk server-side secret key |
| `CLERK_PUBLISHABLE_KEY` | api-server | Clerk publishable key (server-resolved) |
| `VITE_CLERK_PUBLISHABLE_KEY` | mans-erp | Clerk publishable key (frontend) |
| `VITE_CLERK_PROXY_URL` | mans-erp | Clerk proxy path (`/clerk`) |
| `PORT` | api-server, mans-erp | Injected by Replit; each artifact gets a unique port |

All secrets are managed by Replit's secret store — never committed to the repository.

---

## Build & Dev Commands

```bash
# Start development (all workflows auto-start via Replit)
pnpm --filter @workspace/mans-erp run dev        # Frontend on $PORT (22565)
pnpm --filter @workspace/api-server run dev       # API on port 8080

# Database
pnpm --filter @workspace/prisma run push          # Push schema changes to dev DB
pnpm --filter @workspace/prisma run generate      # Regenerate Prisma client
pnpm --filter @workspace/prisma run seed          # Seed reference data
pnpm --filter @workspace/prisma run studio        # Open Prisma Studio

# Code generation
pnpm --filter @workspace/api-spec run codegen     # Regenerate API hooks + Zod

# Type checking
pnpm run typecheck                                 # Check all packages
pnpm run typecheck:libs                            # Check lib packages only
```
