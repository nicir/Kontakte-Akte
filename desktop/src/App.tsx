import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SetupScreen, UnlockScreen } from "@/features/auth/AuthScreens";
import { Shell } from "@/features/shell/Shell";
import { StartupScreen } from "@/features/startup/StartupScreen";
import { get, onSessionEvent, post } from "@/lib/api";
import { onStartupProgress, startBackend, type StartupError } from "@/lib/native";
import type { AuthStatus } from "@/lib/types";

type Phase =
  | { name: "starting"; message: string }
  | { name: "start-error"; error: StartupError }
  | { name: "setup" }
  | { name: "locked"; notice?: string }
  | { name: "unlocked"; session: number };

interface Session {
  lock: (notice?: string) => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("SessionContext missing");
  return ctx;
}

function asStartupError(raw: unknown): StartupError {
  if (raw && typeof raw === "object" && "code" in raw && "message" in raw) return raw as StartupError;
  return { code: "internal", message: "Kontakte-Akte konnte nicht gestartet werden.", detail: String(raw) };
}

export default function App() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ name: "starting", message: "Kontakte-Akte wird vorbereitet …" });
  const sessionCounter = useRef(0);

  const enter = useCallback(
    (next: "unlocked" | "locked" | "setup", notice?: string) => {
      queryClient.clear();
      if (next === "unlocked") {
        sessionCounter.current += 1;
        setPhase({ name: "unlocked", session: sessionCounter.current });
      } else if (next === "locked") setPhase({ name: "locked", notice });
      else setPhase({ name: "setup" });
    },
    [queryClient],
  );

  const boot = useCallback(async () => {
    setPhase({ name: "starting", message: "Kontakte-Akte wird vorbereitet …" });
    const unlisten = await onStartupProgress((p) => {
      if (p.stage !== "ready") setPhase({ name: "starting", message: p.message });
    });
    try {
      await startBackend();
      const status = await get<AuthStatus>("/api/auth/status");
      if (!status.initialized) enter("setup");
      else if (status.authenticated) enter("unlocked");
      else enter("locked");
    } catch (raw) {
      setPhase({ name: "start-error", error: asStartupError(raw) });
    } finally {
      unlisten();
    }
  }, [enter]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(
    () =>
      onSessionEvent((reason) => {
        if (reason === "locked") {
          setPhase((p) => (p.name === "unlocked" ? { name: "locked", notice: "Kontakte-Akte wurde gesperrt." } : p));
          queryClient.clear();
        } else {
          setPhase({
            name: "start-error",
            error: { code: "health_timeout", message: "Die lokale Datenbank ist nicht erreichbar.", detail: null },
          });
        }
      }),
    [queryClient],
  );

  const lock = useCallback(
    async (notice?: string) => {
      try {
        await post("/api/auth/lock");
      } finally {
        enter("locked", notice);
      }
    },
    [enter],
  );

  switch (phase.name) {
    case "starting":
      return <StartupScreen message={phase.message} error={null} onRetry={boot} />;
    case "start-error":
      return <StartupScreen message="" error={phase.error} onRetry={boot} />;
    case "setup":
      return <SetupScreen onDone={() => enter("unlocked")} />;
    case "locked":
      return <UnlockScreen notice={phase.notice} onUnlocked={() => enter("unlocked")} />;
    case "unlocked":
      return (
        <SessionContext.Provider value={{ lock }}>
          <Shell key={phase.session} />
        </SessionContext.Provider>
      );
  }
}
