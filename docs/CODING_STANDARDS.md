# Mans ERP — Coding Standards

---

## General Principles

1. **Clarity over cleverness.** Code is read far more often than it is written. Prefer obvious solutions.
2. **Fail loudly.** Never use silent fallbacks. Surface errors explicitly. Avoid swallowing exceptions.
3. **Bilingual by design.** Every user-facing string must have both an English and Arabic version. No English-only shortcuts.
4. **No direct fetch calls.** Use the Orval-generated hooks from `@workspace/api-client-react` for all API calls from the frontend.
5. **No manual SQL.** Use the Prisma client exclusively on the backend. Never write raw SQL in route handlers.
6. **No unused imports.** TypeScript build fails on unused imports. Do not import anything you don't use.

---

## TypeScript

### Strict Mode
All packages compile with strict TypeScript. Do not disable strict mode or add `@ts-ignore` without an explanatory comment.

### Types vs. Interfaces
- Use `type` for unions, mapped types, and simple object shapes.
- Use `interface` for shapes that may be extended or merged.
- Prefer `type` by default.

### Naming Conventions

| Construct | Convention | Example |
|---|---|---|
| Variables & functions | camelCase | `getUserById`, `totalAmount` |
| React components | PascalCase | `DashboardLayout`, `OrganizationCard` |
| TypeScript types/interfaces | PascalCase | `UserProfile`, `OrganizationInput` |
| Enums | PascalCase | `AccountType`, `UserStatus` |
| Enum members | UPPER_SNAKE_CASE | `ACCOUNT_TYPE.ASSET` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Files (components) | PascalCase | `Dashboard.tsx`, `DashboardLayout.tsx` |
| Files (utilities) | kebab-case | `language-provider.tsx`, `custom-fetch.ts` |
| Database columns (Prisma `@map`) | snake_case | `first_name_en`, `created_at` |
| Prisma model fields | camelCase | `firstNameEn`, `createdAt` |

### No `any`
Avoid `any`. Use `unknown` when the type is genuinely unknown and narrow it before use. Use proper generics.

```typescript
// Bad
const data: any = await fetch(...);

// Good
const data: unknown = await fetch(...);
if (typeof data === 'object' && data !== null) { ... }
```

### Null vs. Undefined
- Use `null` for intentionally absent values (database nullables).
- Use `undefined` for optional function arguments.
- Prisma optional fields come back as `null` — handle accordingly.

---

## React Components

### File Structure
Each component file should contain one primary export. Co-locate sub-components in the same file only if they are small and not reused elsewhere.

```
src/
  pages/          # Route-level pages (one per route)
  components/
    layout/       # App shell components (Sidebar, Header, DashboardLayout)
    ui/           # shadcn/ui library components
    [feature]/    # Feature-specific components
  lib/            # Non-component utilities and providers
  hooks/          # Custom React hooks
```

### Component Rules

```tsx
// 1. Never import React explicitly — the JSX transform handles it
// Bad
import React, { useState } from 'react';
// Good
import { useState } from 'react';

// 2. Always import hooks from 'react'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// 3. Always provide default values to useForm
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { nameEn: '', nameAr: '', type: 'CHARITY' }
});

// 4. Use wouter for navigation — never window.location
import { useLocation } from 'wouter';
const [, setLocation] = useLocation();
setLocation('/dashboard');
```

### RTL / Bilingual Requirements

Every page and component **must** be RTL-aware:

```tsx
import { useLanguage } from '@/lib/language-provider';

function MyComponent() {
  const { lang, dir, t } = useLanguage();

  return (
    // Always apply dir to the root element
    <div dir={dir}>
      {/* Use t() for translated strings */}
      <h1>{t('dashboard.title')}</h1>

      {/* Use ltr:/rtl: Tailwind variants for directional spacing */}
      <div className="flex ltr:flex-row rtl:flex-row-reverse">
        <Icon className="ltr:mr-2 rtl:ml-2" />
        <span>{label}</span>
      </div>

      {/* Show bilingual entity names */}
      <p>{lang === 'ar' ? org.nameAr : org.nameEn}</p>
    </div>
  );
}
```

### Loading and Error States

Every query **must** handle loading and error states:

```tsx
const { data: stats, isLoading, isError } = useGetDashboardStats();

if (isLoading) return <Skeleton className="h-32 w-full" />;
if (isError)   return <Alert variant="destructive">...</Alert>;
```

---

## API Hooks (Orval-Generated)

All API calls on the frontend use generated hooks from `@workspace/api-client-react`. **Never write raw `fetch()` calls or manual TanStack Query hooks when a generated hook exists.**

### Query Hooks

```tsx
// Basic usage
const { data, isLoading, isError } = useListOrganizations();

// With options — always pass queryKey when using enabled
const { data } = useGetOrganization(id, {
  query: {
    enabled: !!id,
    queryKey: getGetOrganizationQueryKey(id)
  }
});
```

Generated query hooks return `T` directly — **not** `{ data: T }`.

### Mutation Hooks

```tsx
const createOrg = useCreateOrganization();

createOrg.mutate(
  { data: { nameEn, nameAr, type } },
  {
    onSuccess: (org) => {
      // org is T directly, not { data: T }
      queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
      setLocation(`/organizations`);
    },
    onError: () => toast({ title: 'Error', variant: 'destructive' })
  }
);

// Show pending state
<Button disabled={createOrg.isPending}>
  {createOrg.isPending ? 'Saving...' : 'Save'}
</Button>
```

---

## Forms

All forms use `react-hook-form` with `zodResolver` for validation.

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';

const schema = z.object({
  nameEn: z.string().min(1, 'Required'),
  nameAr: z.string().min(1, 'مطلوب'),
});

type FormData = z.infer<typeof schema>;

function MyForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { nameEn: '', nameAr: '' }
  });

  const onSubmit = (data: FormData) => { /* ... */ };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="nameEn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name (English)</FormLabel>
              <FormControl>
                <Input data-testid="input-name-en" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
```

---

## Testing Attributes

Every interactive element and meaningful display element **must** have a `data-testid` attribute.

```tsx
// Pattern: {action}-{target} for interactive elements
<Button data-testid="button-submit-organization">Save</Button>
<Input  data-testid="input-name-en" />
<Link   data-testid="link-dashboard" href="/dashboard">Dashboard</Link>

// Pattern: {type}-{content} for display elements
<p data-testid="text-org-name">{org.nameEn}</p>
<span data-testid="badge-status">{status}</span>

// Pattern: {type}-{description}-{id} for lists
{orgs.map(org => (
  <div data-testid={`card-org-${org.id}`} key={org.id}>...</div>
))}
```

---

## Styling

### CSS Custom Properties

The design system uses space-separated HSL values (no `hsl()` wrapper):

```css
/* In index.css */
:root {
  --primary: 243 75% 45%;       /* DO NOT add hsl() wrapper */
}

/* Usage in CSS */
background-color: hsl(var(--primary));

/* Usage in Tailwind */
class="bg-primary text-primary-foreground"
```

### Tailwind Usage Rules

```tsx
// Use cn() for conditional classes
import { cn } from '@/lib/utils';
<div className={cn('base-class', isActive && 'active-class', className)} />

// Never concatenate class strings dynamically
// Bad: `flex ${isRtl ? 'flex-row-reverse' : 'flex-row'}`
// Good:
<div className="flex ltr:flex-row rtl:flex-row-reverse" />

// Use Tailwind variants, not inline styles
// Bad: style={{ marginLeft: '8px' }}
// Good: className="ltr:ml-2 rtl:mr-2"
```

### Icons

Use `lucide-react` for all system icons. Use `react-icons/si` for brand logos.

```tsx
import { LayoutDashboard, Building2, Settings, ChevronDown } from 'lucide-react';
import { SiGithub } from 'react-icons/si';
```

---

## Backend (Express Routes)

### Route File Structure

```typescript
import { Router } from 'express';
import { requireAuth, getAuth } from '@clerk/express';
import { prisma } from '@workspace/prisma';

const router = Router();

// Guard protected routes
router.get('/', requireAuth(), async (req, res) => {
  try {
    const items = await prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' }
    });
    res.json(items);
  } catch (err) {
    // Never swallow — always return error response
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

export default router;
```

### Validation

Validate request bodies before database operations. Use Zod schemas from `@workspace/api-zod` when available, or define inline schemas.

```typescript
import { z } from 'zod';

const createOrgSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  type: z.enum(['CHARITY', 'FOUNDATION', 'NGO', 'ASSOCIATION', 'GOVERNMENT', 'OTHER']),
});

router.post('/', requireAuth(), async (req, res) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  // ...
});
```

### Prisma Patterns

```typescript
// Always filter soft-deleted records
prisma.organization.findMany({ where: { deletedAt: null } })

// Soft delete — never use prisma.xxx.delete()
prisma.organization.update({
  where: { id },
  data: { deletedAt: new Date() }
})

// Select only needed fields when returning lists
prisma.user.findMany({
  where: { deletedAt: null },
  select: { id: true, email: true, firstNameEn: true, role: true }
})

// Use transactions for multi-step operations
await prisma.$transaction([
  prisma.receipt.update({ where: { id }, data: { status: 'CONFIRMED' } }),
  prisma.journalEntry.create({ data: { ... } }),
  prisma.cashBox.update({ where: { id: cashBoxId }, data: { currentBalance: { increment: amount } } }),
])
```

---

## Git Conventions

### Branch Naming
```
feature/phase1-journal-entries
fix/dashboard-stats-query
docs/api-guidelines
chore/upgrade-prisma
```

### Commit Messages
Follow Conventional Commits:
```
feat(accounting): add journal entry posting workflow
fix(auth): resolve Clerk proxy timeout on slow networks
docs(database): document soft delete convention
chore(deps): upgrade Prisma to 6.20
refactor(dashboard): extract stats card into component
```

### What NOT to commit
- `.env` files or any secrets
- `node_modules/`
- `dist/` or `build/` directories
- Prisma-generated client files (they're in `node_modules`)

---

## Error Handling

### Frontend

```tsx
// Use toast for user-facing errors
import { useToast } from '@/hooks/use-toast';
const { toast } = useToast();

mutation.mutate(data, {
  onError: (err) => {
    toast({
      title: lang === 'ar' ? 'حدث خطأ' : 'An error occurred',
      description: lang === 'ar' ? 'يرجى المحاولة مرة أخرى' : 'Please try again',
      variant: 'destructive'
    });
  }
});
```

### Backend

```typescript
// Always catch, always respond, always log
router.get('/:id', requireAuth(), async (req, res) => {
  try {
    const record = await prisma.organization.findFirst({
      where: { id: req.params.id, deletedAt: null }
    });
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json(record);
  } catch (err) {
    req.log.error({ err }, 'Failed to fetch organization');
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

HTTP status codes:
- `200` — Success (GET, PATCH)
- `201` — Created (POST)
- `400` — Bad request (validation failure)
- `401` — Unauthenticated
- `403` — Unauthorized (authenticated but no permission)
- `404` — Not found
- `409` — Conflict (duplicate)
- `500` — Internal server error
