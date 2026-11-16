import { useEffect, useRef } from "react";
import { get, post } from "@/lib/api";
import { localTimeZone, plural } from "@/lib/format";
import { notify, setNotificationPlan } from "@/lib/native";
import type { NotificationPlan, Settings } from "@/lib/types";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const;

/**
 * Locks after `minutes` without user activity (0 = never). While the user is
 * active, the backend session is kept alive with a ping at most once a minute.
 */
export function useAutoLock(minutes: number | undefined, lock: (notice?: string) => void) {
  const lastActivity = useRef(Date.now());
  const lastPing = useRef(Date.now());

  useEffect(() => {
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      if (minutes && minutes > 0 && now - lastActivity.current > minutes * 60_000) {
        lock("Kontakte-Akte wurde nach Inaktivität automatisch gesperrt.");
        return;
      }
      if (now - lastActivity.current < 60_000 && now - lastPing.current > 60_000) {
        lastPing.current = now;
        void post("/api/auth/ping").catch(() => undefined);
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [minutes, lock]);
}

/**
 * Pushes upcoming reminders to the native scheduler (Rust) after unlock, on
 * every data change and every 10 minutes. Announces overdue reminders once per unlock.
 */
export function useNotificationSync() {
  const announced = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const [plan, settings] = await Promise.all([
          get<NotificationPlan>("/api/reminders/notification-plan", { tz: localTimeZone() }),
          get<Settings>("/api/settings"),
        ]);
        if (cancelled) return;
        await setNotificationPlan(plan, settings.notifications_enabled, settings.notification_show_details);
        if (!announced.current && settings.notifications_enabled && plan.overdue_count > 0) {
          announced.current = true;
          await notify(
            "Kontakte-Akte",
            `${plural(plan.overdue_count, "Erinnerung ist", "Erinnerungen sind")} überfällig.`,
          );
        }
        announced.current = true;
      } catch {
        // Locked or backend unavailable – handled globally.
      }
    };
    void sync();
    const onChange = () => void sync();
    window.addEventListener("ka:data-changed", onChange);
    const id = window.setInterval(sync, 10 * 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener("ka:data-changed", onChange);
      window.clearInterval(id);
    };
  }, []);
}
