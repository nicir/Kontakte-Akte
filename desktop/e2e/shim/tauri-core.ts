/**
 * TEST-ONLY replacement for @tauri-apps/api/core, used by vite.e2e.config.ts.
 * Mirrors the Rust bridge (src-tauri/src/bridge.rs): holds the session token,
 * strips it from setup/unlock responses and maps errors to {status, code, message}.
 * The Vite dev proxy adds the bridge token and removes the browser Origin header.
 * Never part of the production bundle.
 */
let session: string | null = null;

async function apiRequest(method: string, path: string, body: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session) headers.Authorization = `Bearer ${session}`;
  let response: Response;
  try {
    response = await fetch(`/__backend${path}`, {
      method,
      headers,
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw { status: 0, code: "backend_unreachable", message: "Die lokale Datenbank ist nicht erreichbar." };
  }
  const route = path.split("?")[0];
  if (route === "/api/auth/lock") session = null;
  const json = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = json?.detail ?? {};
    if (response.status === 423 || (response.status === 401 && detail.code === "unauthorized")) session = null;
    throw { status: response.status, code: detail.code ?? "error", message: detail.message ?? "Fehler" };
  }
  if ((route === "/api/auth/setup" || route === "/api/auth/unlock") && json?.session_token) {
    session = json.session_token;
    delete json.session_token;
  }
  return json;
}

export async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (cmd) {
    case "api_request":
      return (await apiRequest(args.method as string, args.path as string, args.body)) as T;
    case "start_backend":
    case "app_info":
      return {
        version: "e2e",
        data_dir: "(e2e)",
        database_file: "(e2e)/data/kontakte-akte.db",
        backups_dir: "(e2e)/backups",
        backend_url: "http://127.0.0.1:47811",
        shutdown_policy: "E2E-Testmodus",
      } as T;
    case "set_notification_plan":
    case "notify":
      (window as unknown as { __kaNotifications: unknown[] }).__kaNotifications ??= [];
      (window as unknown as { __kaNotifications: unknown[] }).__kaNotifications.push({ cmd, args });
      return undefined as T;
    default:
      return null as T;
  }
}
