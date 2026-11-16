/**
 * Backend access goes exclusively through the Tauri bridge (`api_request`).
 *
 * The web frontend never sees the bridge token or the session token: the Rust
 * side attaches both and strips the session token from unlock/setup responses.
 * The webview's CSP does not even allow connecting to the backend port.
 */
import { invoke } from "@tauri-apps/api/core";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  get isLocked(): boolean {
    return this.status === 423 || (this.status === 401 && this.code === "unauthorized");
  }

  get isUnreachable(): boolean {
    return this.code === "backend_unreachable";
  }
}

type SessionListener = (reason: "locked" | "unreachable") => void;
const listeners = new Set<SessionListener>();

/** Subscribe to global session events (lock / backend gone). */
export function onSessionEvent(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(reason: "locked" | "unreachable") {
  listeners.forEach((l) => l(reason));
}

interface BridgeError {
  status: number;
  code: string;
  message: string;
}

function toApiError(raw: unknown): ApiError {
  if (raw && typeof raw === "object" && "status" in raw && "code" in raw) {
    const e = raw as BridgeError;
    return new ApiError(e.status, e.code, e.message || "Unbekannter Fehler.");
  }
  return new ApiError(0, "bridge", typeof raw === "string" ? raw : "Unbekannter Fehler.");
}

export async function api<T>(method: HttpMethod, path: string, body?: unknown, query?: Record<string, string | number | undefined | null>): Promise<T> {
  let fullPath = path;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) fullPath += `?${qs}`;
  }
  try {
    return await invoke<T>("api_request", { method, path: fullPath, body: body ?? null });
  } catch (raw) {
    const error = toApiError(raw);
    const isAuthCall = path.startsWith("/api/auth/");
    if (error.isLocked && !isAuthCall) emit("locked");
    if (error.isUnreachable) emit("unreachable");
    throw error;
  }
}

export const get = <T>(path: string, query?: Record<string, string | number | undefined | null>) =>
  api<T>("GET", path, undefined, query);
export const post = <T>(path: string, body?: unknown, query?: Record<string, string | number | undefined | null>) =>
  api<T>("POST", path, body ?? {}, query);
export const put = <T>(path: string, body?: unknown, query?: Record<string, string | number | undefined | null>) =>
  api<T>("PUT", path, body ?? {}, query);
export const patch = <T>(path: string, body?: unknown) => api<T>("PATCH", path, body ?? {});
export const del = <T>(path: string) => api<T>("DELETE", path);

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ein unerwarteter Fehler ist aufgetreten.";
}
