import { Router, type IRouter } from "express";
import { db, notificationSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";

const router: IRouter = Router();

router.post("/notifications/subscribe", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { subscription } = req.body || {};

  if (!subscription || typeof subscription !== "object") {
    res.status(400).json({ error: "subscription object is required" });
    return;
  }

  const subscriptionData = JSON.stringify(subscription);

  const [existing] = await db
    .select()
    .from(notificationSubscriptionsTable)
    .where(
      and(
        eq(notificationSubscriptionsTable.userId, userId),
        eq(notificationSubscriptionsTable.subscriptionData, subscriptionData),
      ),
    );

  if (existing) {
    if (!existing.isActive) {
      await db
        .update(notificationSubscriptionsTable)
        .set({ isActive: true })
        .where(eq(notificationSubscriptionsTable.id, existing.id));
    }
    res.json({ id: existing.id, status: "subscribed" });
    return;
  }

  const [sub] = await db
    .insert(notificationSubscriptionsTable)
    .values({
      userId,
      subscriptionData,
      isActive: true,
    })
    .returning();

  res.status(201).json({ id: sub.id, status: "subscribed" });
});

router.delete("/notifications/unsubscribe", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { subscription } = req.body || {};

  if (subscription) {
    const subscriptionData = JSON.stringify(subscription);
    await db
      .update(notificationSubscriptionsTable)
      .set({ isActive: false })
      .where(
        and(
          eq(notificationSubscriptionsTable.userId, userId),
          eq(notificationSubscriptionsTable.subscriptionData, subscriptionData),
        ),
      );
  } else {
    await db
      .update(notificationSubscriptionsTable)
      .set({ isActive: false })
      .where(eq(notificationSubscriptionsTable.userId, userId));
  }

  res.json({ status: "unsubscribed" });
});

router.get("/notifications/status", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const subscriptions = await db
    .select()
    .from(notificationSubscriptionsTable)
    .where(
      and(
        eq(notificationSubscriptionsTable.userId, userId),
        eq(notificationSubscriptionsTable.isActive, true),
      ),
    );

  res.json({
    hasActiveSubscription: subscriptions.length > 0,
    subscriptionCount: subscriptions.length,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
  });
});

export default router;
