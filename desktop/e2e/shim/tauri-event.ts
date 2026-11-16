// TEST-ONLY replacement for @tauri-apps/api/event.
export type UnlistenFn = () => void;
export async function listen(): Promise<UnlistenFn> {
  return () => undefined;
}
