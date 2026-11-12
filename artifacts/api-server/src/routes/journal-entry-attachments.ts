import { Router } from "express";
import { getAuth } from "@clerk/express";
import { prisma, type JournalEntryAttachment } from "@workspace/prisma";
import multer from "multer";
import { createHash, randomUUID } from "crypto";
import { objectStorageClient, signObjectDownloadUrl } from "../lib/objectStorage";
import { requirePermission } from "../lib/authorize";
import { routeParam } from "../lib/route-param";

const router = Router({ mergeParams: true });

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_FILES_PER_ENTRY = 10;

// ── Multer setup ───────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`MIME type not allowed: ${file.mimetype}`));
    }
  },
});

/**
 * Promise-based multer runner so we can handle errors with try/catch
 * in the main async handler and avoid nested-callback TS7030 warnings.
 */
function runUpload(
  req: Parameters<ReturnType<typeof upload.array>>[0],
  res: Parameters<ReturnType<typeof upload.array>>[1],
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    upload.array("files", MAX_FILES_PER_ENTRY)(req, res, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getUser(clerkId: string | null | undefined) {
  if (!clerkId) return null;
  return prisma.user.findFirst({ where: { clerkId, deletedAt: null } });
}

function parsePrivateObjectDir(): { bucketName: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const normalised = dir.startsWith("/") ? dir : `/${dir}`;
  const parts = normalised.split("/").filter(Boolean);
  if (parts.length < 1) throw new Error("Invalid PRIVATE_OBJECT_DIR");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  return { bucketName, prefix };
}

// ── POST /api/journal-entries/:id/attachments ──────────────────────────────────

router.post("/", requirePermission("attachments", "create"), async (req, res) => {
  const entryId = routeParam(req.params, "id");
  if (!entryId) {
    res.status(400).json({ error: "Invalid journal entry ID" });
    return;
  }

  // ── Parse multipart ───────────────────────────────────────────────────────
  try {
    await runUpload(req, res);
  } catch (uploadErr) {
    if (uploadErr instanceof multer.MulterError) {
      if (uploadErr.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File exceeds 20 MB limit" });
        return;
      }
      if (uploadErr.code === "LIMIT_FILE_COUNT") {
        res.status(400).json({ error: `Too many files; maximum is ${MAX_FILES_PER_ENTRY}` });
        return;
      }
      res.status(400).json({ error: uploadErr.message });
      return;
    }
    // fileFilter rejection arrives as a plain Error
    res.status(400).json({ error: (uploadErr as Error).message });
    return;
  }

  // ── Auth + lookup ─────────────────────────────────────────────────────────
  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, organizationId: user.organizationId ?? undefined, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      res.status(404).json({ error: "Journal entry not found" });
      return;
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    // Enforce per-entry attachment cap across all non-deleted records
    const existingCount = await prisma.journalEntryAttachment.count({
      where: { journalEntryId: entryId, deletedAt: null },
    });
    if (existingCount + files.length > MAX_FILES_PER_ENTRY) {
      res.status(400).json({
        error: `Upload would exceed maximum of ${MAX_FILES_PER_ENTRY} attachments per entry`,
      });
      return;
    }

    const { bucketName, prefix } = parsePrivateObjectDir();
    const created: JournalEntryAttachment[] = [];

    for (const file of files) {
      const fileId = randomUUID();
      const objectName = prefix
        ? `${prefix}/attachments/${entryId}/${fileId}`
        : `attachments/${entryId}/${fileId}`;

      // SHA-256 checksum computed server-side from the in-memory buffer
      const checksumSha256 = createHash("sha256").update(file.buffer).digest("hex");

      // Upload to Object Storage (private bucket, no public ACL)
      const gcsFile = objectStorageClient.bucket(bucketName).file(objectName);
      await gcsFile.save(file.buffer, {
        contentType: file.mimetype,
        metadata: { owner: user.id },
      });

      // Persist attachment record
      const attachment = await prisma.journalEntryAttachment.create({
        data: {
          journalEntryId:   entryId,
          uploadedByUserId: user.id,
          fileName:         file.originalname,
          fileSizeBytes:    file.size,
          mimeType:         file.mimetype,
          storageKey:       objectName,
          storageBucket:    bucketName,
          checksumSha256,
          isPrimary:        false,
        },
      });

      created.push(attachment);
    }

    res.status(201).json({ data: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload attachments" });
  }
});

// ── GET /api/journal-entries/:id/attachments ──────────────────────────────────

router.get("/", async (req, res) => {
  const entryId = routeParam(req.params, "id");
  if (!entryId) {
    res.status(400).json({ error: "Invalid journal entry ID" });
    return;
  }

  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, organizationId: user.organizationId ?? undefined, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      res.status(404).json({ error: "Journal entry not found" });
      return;
    }

    const attachments = await prisma.journalEntryAttachment.findMany({
      where: { journalEntryId: entryId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });

    res.json({ data: attachments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list attachments" });
  }
});

// ── DELETE /api/journal-entries/:id/attachments/:attachmentId ─────────────────

router.delete("/:attachmentId", requirePermission("attachments", "delete"), async (req, res) => {
  const entryId = routeParam(req.params, "id");
  const attachmentId = routeParam(req.params, "attachmentId");
  if (!entryId || !attachmentId) {
    res.status(400).json({ error: "Invalid journal entry or attachment ID" });
    return;
  }

  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, organizationId: user.organizationId ?? undefined, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      res.status(404).json({ error: "Journal entry not found" });
      return;
    }

    const attachment = await prisma.journalEntryAttachment.findFirst({
      where: { id: attachmentId, journalEntryId: entryId, deletedAt: null },
      select: { id: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    await prisma.journalEntryAttachment.update({
      where: { id: attachmentId },
      data:  { deletedAt: new Date() },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

// ── PATCH /api/journal-entries/:id/attachments/:attachmentId ──────────────────

router.patch("/:attachmentId", requirePermission("attachments", "update"), async (req, res) => {
  const entryId = routeParam(req.params, "id");
  const attachmentId = routeParam(req.params, "attachmentId");
  if (!entryId || !attachmentId) {
    res.status(400).json({ error: "Invalid journal entry or attachment ID" });
    return;
  }

  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const { isPrimary } = req.body as { isPrimary?: boolean };
    if (isPrimary === undefined) {
      res.status(400).json({ error: "isPrimary is required" });
      return;
    }
    if (typeof isPrimary !== "boolean") {
      res.status(400).json({ error: "isPrimary must be a boolean" });
      return;
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, organizationId: user.organizationId ?? undefined, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      res.status(404).json({ error: "Journal entry not found" });
      return;
    }

    const attachment = await prisma.journalEntryAttachment.findFirst({
      where: { id: attachmentId, journalEntryId: entryId, deletedAt: null },
      select: { id: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    let updated: JournalEntryAttachment;

    if (isPrimary) {
      // Clear any existing primary then set the new one — atomically
      const [, updatedAttachment] = await prisma.$transaction([
        prisma.journalEntryAttachment.updateMany({
          where: { journalEntryId: entryId, isPrimary: true, deletedAt: null },
          data:  { isPrimary: false },
        }),
        prisma.journalEntryAttachment.update({
          where: { id: attachmentId },
          data:  { isPrimary: true },
        }),
      ]);
      updated = updatedAttachment;
    } else {
      updated = await prisma.journalEntryAttachment.update({
        where: { id: attachmentId },
        data:  { isPrimary: false },
      });
    }

    res.json({ data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update attachment" });
  }
});

// ── GET /api/journal-entries/:id/attachments/:attachmentId/download ─────────────

const DOWNLOAD_TTL_SEC = 900; // 15 minutes

router.get("/:attachmentId/download", async (req, res) => {
  const entryId = routeParam(req.params, "id");
  const attachmentId = routeParam(req.params, "attachmentId");
  if (!entryId || !attachmentId) {
    res.status(400).json({ error: "Invalid journal entry or attachment ID" });
    return;
  }

  try {
    const { userId } = getAuth(req);
    const user = await getUser(userId!);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Verify journal entry belongs to this user's organisation
    const entry = await prisma.journalEntry.findFirst({
      where: { id: entryId, organizationId: user.organizationId ?? undefined, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      res.status(404).json({ error: "Journal entry not found" });
      return;
    }

    // Verify attachment exists, belongs to this entry, and is not soft-deleted
    const attachment = await prisma.journalEntryAttachment.findFirst({
      where: { id: attachmentId, journalEntryId: entryId, deletedAt: null },
      select: { id: true, storageBucket: true, storageKey: true },
    });
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SEC * 1000);
    const url = await signObjectDownloadUrl(
      attachment.storageBucket,
      attachment.storageKey,
      DOWNLOAD_TTL_SEC,
    );

    res.json({ url, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

export default router;
