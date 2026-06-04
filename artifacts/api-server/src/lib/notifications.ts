import webpush from "web-push";
import { db, notificationSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

let vapidConfigured = false;

export function initVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  let subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (subject && !subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    subject = `mailto:${subject}`;
  }

  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidConfigured = true;
      logger.info("VAPID keys configured for web push notifications");
    } catch (err) {
      logger.error({ err }, "Invalid VAPID keys — push notifications disabled. Regenerate keys using: node -e \"console.log(require('web-push').generateVAPIDKeys())\"");
    }
  } else {
    logger.warn("VAPID keys not configured — push notifications disabled");
  }
}

export async function sendPushNotification(
  userId: number,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (!vapidConfigured) {
    logger.warn("Push notification skipped: VAPID not configured");
    return;
  }

  const subscriptions = await db
    .select()
    .from(notificationSubscriptionsTable)
    .where(
      and(
        eq(notificationSubscriptionsTable.userId, userId),
        eq(notificationSubscriptionsTable.isActive, true),
      ),
    );

  logger.info({ userId, subscriptionCount: subscriptions.length, title: payload.title }, "Sending push notification");

  if (subscriptions.length === 0) {
    logger.warn({ userId }, "No active push subscriptions found for user");
    return;
  }

  for (const sub of subscriptions) {
    try {
      const subscription = JSON.parse(sub.subscriptionData);
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      logger.info({ userId, subscriptionId: sub.id }, "Push notification sent successfully");
    } catch (err: unknown) {
      const statusCode = err instanceof Error && "statusCode" in err ? (err as { statusCode: number }).statusCode : undefined;
      if (statusCode === 410 || statusCode === 404) {
        logger.info({ userId, subscriptionId: sub.id, statusCode }, "Push subscription expired, deactivating");
        await db
          .update(notificationSubscriptionsTable)
          .set({ isActive: false })
          .where(eq(notificationSubscriptionsTable.id, sub.id));
      } else {
        logger.error({ err, subscriptionId: sub.id, statusCode }, "Failed to send push notification");
      }
    }
  }
}
