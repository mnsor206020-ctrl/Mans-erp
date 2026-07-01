import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// ── Mock Clerk before router import ───────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  requireAuth:     () => (_req: any, _res: any, next: any) => { next(); },
  getAuth:         (_req: any) => ({ userId: "test-clerk-id" }),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => { next(); },
}));

// ── Mock Prisma before router import ──────────────────────────────────────────
vi.mock("@workspace/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
    },
    journalEntry: {
      findFirst: vi.fn(),
    },
    journalEntryAttachment: {
      count:     vi.fn(),
      create:    vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

// ── Mock Object Storage before router import ───────────────────────────────────
// Use vi.hoisted so the variables are available inside the vi.mock factory
const { mockSave, mockFile, mockBucket, mockSignDownload } = vi.hoisted(() => {
  const mockSave         = vi.fn().mockResolvedValue(undefined);
  const mockFile         = vi.fn((_name: string) => ({ save: mockSave }));
  const mockBucket       = vi.fn((_name: string) => ({ file: mockFile }));
  const mockSignDownload = vi.fn().mockResolvedValue("https://storage.googleapis.com/signed?token=abc");
  return { mockSave, mockFile, mockBucket, mockSignDownload };
});

vi.mock("../lib/objectStorage", () => ({
  objectStorageClient: {
    bucket: mockBucket,
  },
  signObjectDownloadUrl: mockSignDownload,
}));

// ── Import router (gets mocked dependencies) ───────────────────────────────────
import attachmentsRouter from "../routes/journal-entry-attachments";
import { prisma } from "@workspace/prisma";

// ── Test fixtures ─────────────────────────────────────────────────────────────
const ORG_ID   = "aaaaaaaa-0000-0000-0000-000000000001";
const ENTRY_ID = "cccccccc-0000-0000-0000-000000000003";
const USER_ID  = "dddddddd-0000-0000-0000-000000000004";

const mockUser  = { id: USER_ID, organizationId: ORG_ID, clerkId: "test-clerk-id" };
const mockEntry = { id: ENTRY_ID };

const SMALL_PDF = Buffer.from("%PDF-1.4 tiny");
const ATTACHMENT_RECORD = {
  id:               "eeeeeeee-0000-0000-0000-000000000005",
  journalEntryId:   ENTRY_ID,
  uploadedByUserId: USER_ID,
  fileName:         "test.pdf",
  fileSizeBytes:    SMALL_PDF.length,
  mimeType:         "application/pdf",
  storageKey:       "private/attachments/cccccccc-0000-0000-0000-000000000003/some-uuid",
  storageBucket:    "test-bucket",
  checksumSha256:   "abc123",
  isPrimary:        false,
};

// ── App factory ───────────────────────────────────────────────────────────────
function makeApp() {
  const app = express();
  // Mount with :id param so mergeParams works
  app.use("/journal-entries/:id/attachments", attachmentsRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("POST /journal-entries/:id/attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIVATE_OBJECT_DIR = "/test-bucket/private";

    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockEntry);
    (prisma.journalEntryAttachment as any).count.mockResolvedValue(0);
    (prisma.journalEntryAttachment as any).create.mockResolvedValue(ATTACHMENT_RECORD);

    mockSave.mockResolvedValue(undefined);
  });

  it("returns 201 and stores checksumSha256 for a valid PDF", async () => {
    const app = makeApp();

    const res = await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .attach("files", SMALL_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    // Prisma create should have been called with a checksumSha256 field
    const createCall = (prisma.journalEntryAttachment as any).create.mock.calls[0][0];
    expect(createCall.data.checksumSha256).toBeDefined();
    expect(createCall.data.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(createCall.data.mimeType).toBe("application/pdf");
    expect(createCall.data.storageBucket).toBe("test-bucket");
    expect(createCall.data.storageKey).toContain("private/attachments/");
  });

  it("returns 400 for a disallowed MIME type", async () => {
    const app = makeApp();

    const res = await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .attach("files", Buffer.from("MZ"), {
        filename: "evil.exe",
        contentType: "application/x-msdownload",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/MIME type not allowed/i);
    expect(mockSave).not.toHaveBeenCalled();
    expect((prisma.journalEntryAttachment as any).create).not.toHaveBeenCalled();
  });

  it("returns 400 when upload would exceed 10 attachment cap", async () => {
    // 9 existing + 2 new = 11 > 10
    (prisma.journalEntryAttachment as any).count.mockResolvedValue(9);
    const app = makeApp();

    const res = await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .attach("files", SMALL_PDF, { filename: "a.pdf", contentType: "application/pdf" })
      .attach("files", SMALL_PDF, { filename: "b.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceed maximum of 10/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns 400 when a file exceeds 20 MB", async () => {
    const app = makeApp();
    // 21 MB buffer
    const bigBuffer = Buffer.alloc(21 * 1024 * 1024, 0x25);

    const res = await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .attach("files", bigBuffer, { filename: "big.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/20 MB/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns 400 when no files are provided", async () => {
    const app = makeApp();

    const res = await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .set("Content-Type", "multipart/form-data");

    expect(res.status).toBe(400);
  });

  it("returns 404 when the journal entry does not exist", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(null);
    const app = makeApp();

    const res = await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .attach("files", SMALL_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(404);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("returns 401 when the user is not found in the database", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    const app = makeApp();

    const res = await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .attach("files", SMALL_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(401);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("uploads to correct GCS bucket and object path", async () => {
    const app = makeApp();

    await request(app)
      .post(`/journal-entries/${ENTRY_ID}/attachments`)
      .attach("files", SMALL_PDF, { filename: "test.pdf", contentType: "application/pdf" });

    expect(mockBucket).toHaveBeenCalledWith("test-bucket");
    expect(mockFile).toHaveBeenCalledWith(
      expect.stringContaining(`private/attachments/${ENTRY_ID}/`)
    );
    expect(mockSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf" })
    );
  });

  it("accepts image/jpeg, image/png, image/webp, and Excel MIME types", async () => {
    const allowedTypes = [
      { contentType: "image/jpeg", filename: "photo.jpg" },
      { contentType: "image/png",  filename: "chart.png" },
      { contentType: "image/webp", filename: "scan.webp" },
      {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "report.xlsx",
      },
      { contentType: "application/vnd.ms-excel", filename: "report.xls" },
    ];

    for (const { contentType, filename } of allowedTypes) {
      vi.clearAllMocks();
      (prisma.user.findFirst as any).mockResolvedValue(mockUser);
      (prisma.journalEntry.findFirst as any).mockResolvedValue(mockEntry);
      (prisma.journalEntryAttachment as any).count.mockResolvedValue(0);
      (prisma.journalEntryAttachment as any).create.mockResolvedValue({
        ...ATTACHMENT_RECORD,
        mimeType: contentType,
        fileName: filename,
      });
      mockSave.mockResolvedValue(undefined);

      const app = makeApp();
      const res = await request(app)
        .post(`/journal-entries/${ENTRY_ID}/attachments`)
        .attach("files", Buffer.from("data"), { filename, contentType });

      expect(res.status).toBe(201);
    }
  });
});

// ── Download tests ────────────────────────────────────────────────────────────

const ATTACH_ID = "ffffffff-0000-0000-0000-000000000010";
const MOCK_ATTACHMENT_ROW = {
  id:           ATTACH_ID,
  storageBucket: "test-bucket",
  storageKey:   "private/attachments/cccccccc-0000-0000-0000-000000000003/some-uuid",
};
const SIGNED_URL = "https://storage.googleapis.com/signed?token=abc";

describe("GET /journal-entries/:id/attachments/:attachmentId/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIVATE_OBJECT_DIR = "/test-bucket/private";

    (prisma.user.findFirst as any).mockResolvedValue(mockUser);
    (prisma.journalEntry.findFirst as any).mockResolvedValue(mockEntry);
    (prisma.journalEntryAttachment as any).findFirst.mockResolvedValue(MOCK_ATTACHMENT_ROW);
    mockSignDownload.mockResolvedValue(SIGNED_URL);
  });

  it("returns 200 with { url, expiresAt } for a valid attachment", async () => {
    const app = makeApp();

    const before = Date.now();
    const res = await request(app)
      .get(`/journal-entries/${ENTRY_ID}/attachments/${ATTACH_ID}/download`);
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.url).toBe(SIGNED_URL);
    expect(typeof res.body.expiresAt).toBe("string");

    // expiresAt must be ~15 minutes in the future
    const expiresMs = new Date(res.body.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 900_000);
    expect(expiresMs).toBeLessThanOrEqual(after  + 900_000);
  });

  it("calls signObjectDownloadUrl with correct bucket, key, and TTL", async () => {
    const app = makeApp();
    await request(app)
      .get(`/journal-entries/${ENTRY_ID}/attachments/${ATTACH_ID}/download`);

    expect(mockSignDownload).toHaveBeenCalledWith(
      "test-bucket",
      "private/attachments/cccccccc-0000-0000-0000-000000000003/some-uuid",
      900,
    );
  });

  it("returns 404 when the journal entry does not exist", async () => {
    (prisma.journalEntry.findFirst as any).mockResolvedValue(null);
    const app = makeApp();

    const res = await request(app)
      .get(`/journal-entries/${ENTRY_ID}/attachments/${ATTACH_ID}/download`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/journal entry not found/i);
    expect(mockSignDownload).not.toHaveBeenCalled();
  });

  it("returns 404 when the attachment does not exist", async () => {
    (prisma.journalEntryAttachment as any).findFirst.mockResolvedValue(null);
    const app = makeApp();

    const res = await request(app)
      .get(`/journal-entries/${ENTRY_ID}/attachments/${ATTACH_ID}/download`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/attachment not found/i);
    expect(mockSignDownload).not.toHaveBeenCalled();
  });

  it("returns 404 when attachment is soft-deleted (findFirst returns null)", async () => {
    // Soft-deleted attachments have deletedAt != null — Prisma WHERE filters them;
    // findFirst returns null the same as not found.
    (prisma.journalEntryAttachment as any).findFirst.mockResolvedValue(null);
    const app = makeApp();

    const res = await request(app)
      .get(`/journal-entries/${ENTRY_ID}/attachments/${ATTACH_ID}/download`);

    expect(res.status).toBe(404);
    expect(mockSignDownload).not.toHaveBeenCalled();
  });

  it("returns 401 when the user is not found in the database", async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    const app = makeApp();

    const res = await request(app)
      .get(`/journal-entries/${ENTRY_ID}/attachments/${ATTACH_ID}/download`);

    expect(res.status).toBe(401);
    expect(mockSignDownload).not.toHaveBeenCalled();
  });
});
