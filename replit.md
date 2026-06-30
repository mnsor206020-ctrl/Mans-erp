# Mans ERP

A production-ready cloud ERP system for nonprofit organizations and charities in Saudi Arabia. Supports bilingual Arabic/English with full RTL layout switching.

## Run & Operate

- `pnpm --filter @workspace/mans-erp run dev` — run the frontend (Mans ERP UI)
- `pnpm --filter @workspace/api-server run dev` — run the API server (Express)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend:** React 18 + Vite, Tailwind CSS, shadcn/ui, Wouter (routing)
- **Auth:** Clerk (Replit-managed, via `/clerk` proxy)
- **API:** Express 5, OpenAPI spec → Orval codegen → React Query hooks
- **DB:** PostgreSQL + Drizzle ORM
- **i18n/RTL:** Custom LanguageContext, Noto Sans Arabic, Tailwind RTL variants
- **Theme:** next-themes (light/dark), deep indigo primary, dark slate sidebar

## Where things live

- `artifacts/mans-erp/src/` — React frontend
  - `pages/` — Home, Dashboard, Organizations, NewOrganization, Settings
  - `components/layout/` — DashboardLayout, Sidebar, Header
  - `lib/language-provider.tsx` — Arabic/English RTL context
  - `components/theme-provider.tsx` — Dark mode provider
- `artifacts/api-server/src/routes/` — Express route handlers
  - `dashboard.ts` — `/api/dashboard/stats` + `/api/dashboard/activity`
  - `organizations.ts` — CRUD for organizations
  - `users.ts` — Current user profile + user list
- `lib/db/src/schema/` — Drizzle schema
  - `organizations.ts`, `users.ts`, `activity.ts`
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — Generated Zod validators (do not edit)

## Architecture decisions

- OpenAPI-first: All API contracts live in `openapi.yaml`; hooks and Zod validators are generated. Never hand-write types that codegen produces.
- Auth via Clerk proxy at `/clerk` — frontend uses `proxyUrl="/clerk"` so all Clerk JS/API traffic goes through our Express server.
- Language stored in localStorage (`mans-erp-lang`) with LanguageContext wrapping the whole app.
- Drizzle ORM with `timestamp(..., { withTimezone: true })` for all instants; schema push via `pnpm --filter @workspace/db run push`.
- After each `openapi.yaml` change, run codegen before using updated types.

## Product

**Foundation complete:**
- Landing page (bilingual, public)
- Sign In / Sign Up pages (Clerk-powered)
- Protected dashboard with stats cards and recent activity feed
- Organizations list and create form
- User settings/profile page
- Dark/light mode toggle
- Arabic (RTL) / English (LTR) language toggle with persistent preference

**Next ERP modules to build:**
- Beneficiaries management
- Projects & programs
- Donations & financial tracking
- Volunteers management
- Reports & analytics

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`.
- Clerk dev keys show a console warning in development — this is expected and not a bug.
- `@clerk/themes` is installed in `artifacts/mans-erp` for Clerk appearance customization.
- DB schema changes: run `pnpm --filter @workspace/db run push` after editing `lib/db/src/schema/`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `clerk-auth` skill for auth customization
