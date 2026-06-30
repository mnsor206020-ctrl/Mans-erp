import { Router } from "express";
import { getAuth, requireAuth } from "@clerk/express";
import { prisma } from "@workspace/prisma";

const router = Router();

router.get("/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let user = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { clerkId: userId, email: "" },
      });
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

    const { firstNameEn, lastNameEn, firstNameAr, lastNameAr, avatarUrl } = req.body;
    const user = await prisma.user.update({
      where: { clerkId: userId },
      data:  { firstNameEn, lastNameEn, firstNameAr, lastNameAr, avatarUrl },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.get("/", requireAuth(), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to list users" });
  }
});

export default router;
