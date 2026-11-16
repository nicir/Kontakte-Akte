/** Narrow wrappers around the Rust commands exposed by the desktop shell. */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { NotificationPlan } from "./types";

export interface StartupProgress {
  stage: "docker-check" | "docker-start" | "image" | "backend-start" | "health" | "ready";
  message: string;
}

export interface StartupError {
  code:
    | "docker_missing"
    | "docker_not_running"
    | "image_failed"
    | "backend_failed"
    | "port_in_use"
    | "health_timeout"
    | "internal";
  message: string;
  detail?: string | null;
}

export interface AppInfo {
  version: string;
  data_dir: string;
  database_file: string;
  backups_dir: string;
  backend_url: string;
  shutdown_policy: string;
}

export function startBackend(): Promise<AppInfo> {
  return invoke<AppInfo>("start_backend");
}

export function onStartupProgress(handler: (p: StartupProgress) => void): Promise<UnlistenFn> {
  return listen<StartupProgress>("startup-progress", (event) => handler(event.payload));
}

export function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

/** Opens a native save dialog (in Rust) and copies the backup there. Returns the destination or null. */
export function exportBackup(fileName: string): Promise<string | null> {
  return invoke<string | null>("export_backup", { fileName });
}

/** Opens a native open dialog (in Rust) and stages the chosen file for restore. Returns the staged file name. */
export function importBackup(): Promise<string | null> {
  return invoke<string | null>("import_backup");
}

export function setNotificationPlan(plan: NotificationPlan, enabled: boolean, showDetails: boolean): Promise<void> {
  return invoke("set_notification_plan", { plan, enabled, showDetails });
}

export function notify(title: string, body: string): Promise<void> {
  return invoke("notify", { title, body });
}
