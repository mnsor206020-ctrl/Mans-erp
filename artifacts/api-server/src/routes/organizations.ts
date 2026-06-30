import { Router } from "express";
import { db, organizationsTable, insertOrganizationSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@clerk/express";

const router = Router();

router.get("/", requireAuth(), async (req, res) => {
  try {
    const orgs = await db.select().from(organizationsTable).orderBy(organizationsTable.createdAt);
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
});

router.post("/", requireAuth(), async (req, res) => {
  try {
    const parsed = insertOrganizationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }
    const [org] = await db.insert(organizationsTable).values(parsed.data).returning();
    res.status(201).json(org);
  } catch (err) {
    res.status(500).json({ error: "Failed to create organization" });
  }
});

router.get("/:id", requireAuth(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id));
    if (!org) return res.status(404).json({ error: "Not found" });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch organization" });
  }
});

router.patch("/:id", requireAuth(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [org] = await db
      .update(organizationsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(organizationsTable.id, id))
      .returning();
    if (!org) return res.status(404).json({ error: "Not found" });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: "Failed to update organization" });
  }
});

export default router;
