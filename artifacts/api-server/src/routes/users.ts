import { Router } from "express";
import { getAuth, requireAuth } from "@clerk/express";
import { db, usersTable, insertUserSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));

    if (!user) {
      const parsed = insertUserSchema.safeParse({
        clerkId: userId,
        email: "",
        role: "member",
      });
      if (!parsed.success) return res.status(400).json({ error: "Invalid user data" });
      const [created] = await db.insert(usersTable).values(parsed.data).returning();
      user = created;
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.patch("/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const [user] = await db
      .update(usersTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(usersTable.clerkId, userId))
      .returning();

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.get("/", requireAuth(), async (req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to list users" });
  }
});

export default router;
