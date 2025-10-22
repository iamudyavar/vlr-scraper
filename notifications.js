import axios from 'axios';

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const NOTIFICATION_COOLDOWN_MS = 30 * 60 * 1000;
let lastNotificationTimestamp = 0;

/**
 * Sends a notification
 * @param {string} title - The title of the notification.
 * @param {string} message - The main content of the notification.
 */
export async function sendNotification(title, message) {
    const now = Date.now();

    if (now - lastNotificationTimestamp < NOTIFICATION_COOLDOWN_MS) {
        console.log('[Notification] 🤫 Cooldown active. Skipping notification.');
        return;
    }

    if (!WEBHOOK_URL) {
        console.warn('[Notification] ⚠️ WEBHOOK_URL not set. Skipping notification.');
        return;
    }

    lastNotificationTimestamp = now;

    try {
        const payload = {
            content: `**${title}**\n${message}`
        };

        await axios.post(WEBHOOK_URL, payload);
        console.log(`[Notification] 🔔 Notification sent: ${title}`);
    } catch (error) {
        console.error(`[Notification] ❌ Failed to send notification: ${error.message}`);
        lastNotificationTimestamp = 0;
    }
}