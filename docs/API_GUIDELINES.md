# Mans ERP — API Guidelines

---

## Overview

Mans ERP uses an **OpenAPI-first** approach. The source of truth for all API contracts is:

```
lib/api-spec/openapi.yaml
```

**Derived artifacts are never edited manually:**
- `lib/api-client-react/src/generated/api.ts` — TanStack Query hooks
- `lib/api-zod/src/generated/api.ts` — Zod validators

After every change to `openapi.yaml`, regenerate all derived files:
```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Base URL

```
Development:  http://localhost:8080/api
Production:   https://<domain>/api
```

All routes are prefixed with `/api` in the Express router.

---

## Authentication

All non-public endpoints require a valid Clerk JWT in the `Authorization` header.

```
Authorization: Bearer <clerk_jwt>
```

On the frontend, `custom-fetch.ts` handles this automatically — it calls `getToken()` from the Clerk session and attaches it to every request. **Do not manually manage tokens in components.**

On the backend, routes are protected with `requireAuth()` from `@clerk/express`:

```typescript
router.get('/stats', requireAuth(), async (req, res) => { ... });
```

Unauthenticated requests receive:
```json
{ "error": "Unauthenticated" }
// HTTP 401
```

---

## Currently Implemented Endpoints

### Health

#### `GET /api/healthz`
Returns server health status. No authentication required.

**Response `200`:**
```json
{ "status": "ok" }
```

---

### Dashboard

#### `GET /api/dashboard/stats`
Returns organization-wide key metrics.

**Response `200`:**
```json
{
  "totalUsers": 12,
  "totalOrganizations": 3,
  "activeProjects": 0,
  "totalBeneficiaries": 0,
  "totalDonations": 0,
  "monthlyGrowth": 12.5
}
```

#### `GET /api/dashboard/activity`
Returns the 20 most recent audit log entries as an activity feed.

**Response `200`:**
```json
[
  {
    "id": 1,
    "type": "create",
    "description": "Database seeded with initial reference data",
    "descriptionAr": "Database seeded with initial reference data",
    "userName": "System",
    "createdAt": "2026-06-30T09:00:00.000Z"
  }
]
```

---

### Organizations

#### `GET /api/organizations`
Returns all non-deleted organizations ordered by creation date.

**Response `200`:** Array of organization objects.

#### `POST /api/organizations`
Creates a new organization.

**Request body:**
```json
{
  "nameEn": "Insaan Foundation",
  "nameAr": "مؤسسة إنسان",
  "type": "FOUNDATION",
  "registrationNumber": "SA-999-2026",
  "email": "info@insaan.org.sa",
  "phone": "+966-21-1234567",
  "city": "جدة"
}
```

Required: `nameEn`, `nameAr`, `type`

Valid `type` values: `CHARITY`, `FOUNDATION`, `NGO`, `ASSOCIATION`, `GOVERNMENT`, `OTHER`

**Response `201`:** Created organization object.

#### `GET /api/organizations/:id`
Returns a single organization by UUID.

**Response `404`:** `{ "error": "Not found" }`

#### `PATCH /api/organizations/:id`
Partially updates an organization. Send only the fields to change.

---

### Users

#### `GET /api/users/me`
Returns the current authenticated user's profile. Creates the record automatically on first call (first sign-in auto-provisioning).

**Response `200`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "clerkId": "user_2abc...",
  "email": "admin@albirr.org.sa",
  "firstNameEn": "Mohammed",
  "lastNameEn": "Al-Rashidi",
  "firstNameAr": "محمد",
  "lastNameAr": "الراشدي",
  "avatarUrl": null,
  "status": "ACTIVE",
  "createdAt": "2026-06-30T09:00:00.000Z"
}
```

#### `PATCH /api/users/me`
Updates the current user's profile fields.

**Request body:** Any subset of `firstNameEn`, `lastNameEn`, `firstNameAr`, `lastNameAr`, `avatarUrl`.

#### `GET /api/users`
Returns all non-deleted users.

---

## Adding New Endpoints — Step-by-Step

### Step 1 — Define the contract in `openapi.yaml`

```yaml
paths:
  /journal-entries:
    get:
      operationId: listJournalEntries
      tags: [journals]
      summary: List journal entries
      security:
        - bearerAuth: []
      parameters:
        - name: fiscalYearId
          in: query
          required: false
          schema:
            type: string
            format: uuid
        - name: status
          in: query
          required: false
          schema:
            type: string
            enum: [DRAFT, POSTED, VOIDED]
      responses:
        "200":
          description: Journal entries list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/JournalEntry"
        "401":
          description: Unauthorized

components:
  schemas:
    JournalEntry:
      type: object
      properties:
        id:
          type: string
          format: uuid
        number:
          type: string
        entryDate:
          type: string
          format: date
        status:
          type: string
          enum: [DRAFT, POSTED, VOIDED]
        totalDebit:
          type: number
        totalCredit:
          type: number
      required: [id, number, entryDate, status, totalDebit, totalCredit]
```

### Step 2 — Run codegen

```bash
pnpm --filter @workspace/api-spec run codegen
```

This generates `useListJournalEntries`, `getListJournalEntriesQueryKey`, and the Zod schema automatically.

### Step 3 — Implement the Express route

```typescript
// artifacts/api-server/src/routes/journals.ts
import { Router } from 'express';
import { requireAuth } from '@clerk/express';
import { prisma } from '@workspace/prisma';

const router = Router();

router.get('/', requireAuth(), async (req, res) => {
  try {
    const { fiscalYearId, status } = req.query;
    const entries = await prisma.journalEntry.findMany({
      where: {
        deletedAt: null,
        ...(fiscalYearId ? { fiscalYearId: fiscalYearId as string } : {}),
        ...(status ? { status: status as string } : {}),
      },
      orderBy: { entryDate: 'desc' },
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

export default router;
```

### Step 4 — Register in the router

```typescript
// artifacts/api-server/src/routes/index.ts
import journalsRouter from './journals';
router.use('/journal-entries', journalsRouter);
```

### Step 5 — Use the generated hook on the frontend

```tsx
import {
  useListJournalEntries,
  getListJournalEntriesQueryKey
} from '@workspace/api-client-react';

const { data: entries, isLoading } = useListJournalEntries(
  { fiscalYearId: activeFiscalYearId },
  {
    query: {
      enabled: !!activeFiscalYearId,
      queryKey: getListJournalEntriesQueryKey({ fiscalYearId: activeFiscalYearId })
    }
  }
);
```

---

## Response Conventions

### Success — Single Resource
Return the object directly (no wrapper):
```json
{ "id": "...", "nameEn": "...", "createdAt": "..." }
```

### Success — Collection
Return a JSON array directly (no wrapper):
```json
[ { "id": "..." }, { "id": "..." } ]
```

### Error Response
```json
{
  "error": "Human-readable error message",
  "details": { }
}
```

### HTTP Status Codes

| Code | When to use |
|---|---|
| `200` | Success — GET, PATCH |
| `201` | Resource created — POST |
| `400` | Validation failure, malformed request |
| `401` | Missing or invalid authentication token |
| `403` | Authenticated but lacks permission |
| `404` | Record not found (or soft-deleted) |
| `409` | Conflict — duplicate unique value |
| `500` | Unexpected server error |

---

## URL & Operation Naming Conventions

| Action | HTTP Method | Operation ID | URL Pattern |
|---|---|---|---|
| List all | GET | `list{Resource}` | `/api/{resources}` |
| Get one | GET | `get{Resource}` | `/api/{resources}/:id` |
| Create | POST | `create{Resource}` | `/api/{resources}` |
| Partial update | PATCH | `update{Resource}` | `/api/{resources}/:id` |
| Full replace | PUT | `replace{Resource}` | `/api/{resources}/:id` |
| Soft delete | DELETE | `delete{Resource}` | `/api/{resources}/:id` |
| Custom action | POST | `{verb}{Resource}` | `/api/{resources}/:id/actions/{verb}` |

**Custom action examples:**
```
POST /api/journal-entries/:id/actions/post
POST /api/journal-entries/:id/actions/void
POST /api/receipts/:id/actions/confirm
POST /api/receipts/:id/actions/void
POST /api/fiscal-years/:id/actions/close
```

---

## Query Parameters Convention

| Parameter | Type | Description |
|---|---|---|
| `page` | integer | Page number (1-indexed) |
| `pageSize` | integer | Items per page (default: 25, max: 100) |
| `sortBy` | string | Field name to sort by |
| `sortDir` | string | `asc` or `desc` |
| `search` | string | Free-text search across name fields |
| `status` | string | Filter by status enum value |
| `from` | date | Start of date range filter |
| `to` | date | End of date range filter |

---

## Security Rules

1. Every non-public route must use `requireAuth()` — no exceptions
2. All POST/PATCH request bodies must be validated with Zod before touching the database
3. Never return stack traces in production error responses
4. Never expose `clerkId` in list endpoints
5. All financial mutation endpoints (post, void, confirm) must log to `audit_logs`
