//! Local reminder notifications while the app is running (window may be closed).
//!
//! The frontend pushes the upcoming reminders (next ~8 days) after unlock and
//! after every change. A background thread fires native notifications when
//! they become due. While Kontakte-Akte is locked, notifications are generic
//! and contain no names or titles. Nothing is sent over the network.

use std::collections::HashSet;
use std::sync::Mutex;

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct PlannedNotification {
    pub id: String,
    pub title: String,
    pub contact_name: Option<String>,
    pub due_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NotificationPlan {
    #[allow(dead_code)]
    pub overdue_count: u32,
    #[allow(dead_code)]
    pub today_count: u32,
    pub upcoming: Vec<PlannedNotification>,
}

#[derive(Default)]
pub struct Scheduler {
    inner: Mutex<SchedulerState>,
}

#[derive(Default)]
struct SchedulerState {
    enabled: bool,
    show_details: bool,
    items: Vec<PlannedNotification>,
    fired: HashSet<String>,
}

pub struct Due {
    pub title: String,
    pub body: String,
}

/// Notifications older than this when the app notices them (e.g. after sleep) are skipped;
/// they show up as "overdue" in the app instead.
const STALE_MS: i64 = 12 * 60 * 60 * 1000;

impl Scheduler {
    pub fn set_plan(&self, plan: NotificationPlan, enabled: bool, show_details: bool) {
        let mut state = self.inner.lock().unwrap();
        state.enabled = enabled;
        state.show_details = show_details;
        state.items = plan.upcoming;
    }

    /// Called on lock: drop personal details, keep only the due times.
    pub fn redact(&self) {
        let mut state = self.inner.lock().unwrap();
        for item in &mut state.items {
            item.title.clear();
            item.contact_name = None;
        }
    }

    pub fn take_due(&self, now_ms: i64, unlocked: bool) -> Vec<Due> {
        let mut state = self.inner.lock().unwrap();
        if !state.enabled {
            return vec![];
        }
        let show = state.show_details && unlocked;
        let mut due = vec![];
        let mut fired_now = vec![];
        for item in &state.items {
            if item.due_at_ms <= now_ms && !state.fired.contains(&item.id) {
                fired_now.push(item.id.clone());
                if now_ms - item.due_at_ms > STALE_MS {
                    continue;
                }
                let body = if show && !item.title.is_empty() {
                    match &item.contact_name {
                        Some(name) => format!("{} – {}", item.title, name),
                        None => item.title.clone(),
                    }
                } else {
                    "Eine Erinnerung ist fällig. Öffne Kontakte-Akte für Details.".to_string()
                };
                due.push(Due { title: "Erinnerung fällig".into(), body });
            }
        }
        state.fired.extend(fired_now);
        due
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(due: i64) -> NotificationPlan {
        NotificationPlan {
            overdue_count: 0,
            today_count: 0,
            upcoming: vec![PlannedNotification {
                id: "r1".into(),
                title: "Rahul anrufen".into(),
                contact_name: Some("Rahul Sharma".into()),
                due_at_ms: due,
            }],
        }
    }

    #[test]
    fn fires_once_when_due() {
        let s = Scheduler::default();
        s.set_plan(plan(1_000), true, true);
        assert!(s.take_due(999, true).is_empty());
        let due = s.take_due(1_000, true);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].body, "Rahul anrufen – Rahul Sharma");
        assert!(s.take_due(2_000, true).is_empty(), "no duplicates");
        s.set_plan(plan(1_000), true, true);
        assert!(s.take_due(3_000, true).is_empty(), "re-pushing the plan does not re-fire");
    }

    #[test]
    fn generic_text_while_locked_or_redacted() {
        let s = Scheduler::default();
        s.set_plan(plan(1_000), true, true);
        assert!(s.take_due(1_000, false)[0].body.starts_with("Eine Erinnerung"));
        let s = Scheduler::default();
        s.set_plan(plan(1_000), true, true);
        s.redact();
        assert!(s.take_due(1_000, true)[0].body.starts_with("Eine Erinnerung"));
    }

    #[test]
    fn disabled_and_stale_are_skipped() {
        let s = Scheduler::default();
        s.set_plan(plan(1_000), false, true);
        assert!(s.take_due(5_000, true).is_empty());
        let s = Scheduler::default();
        s.set_plan(plan(1_000), true, true);
        assert!(s.take_due(1_000 + STALE_MS + 1, true).is_empty());
    }
}
