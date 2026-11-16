import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { BrainLogo } from "@/components/BrainLogo";
import { Button } from "@/components/ui/button";
import type { StartupError } from "@/lib/native";

export function BrandedFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center bg-background px-6">
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-10" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrainLogo tile className="mb-4 size-16 drop-shadow-sm" />
          <h1 className="text-xl font-semibold tracking-tight">Kontakte-Akte</h1>
          <p className="text-sm text-muted-foreground">Dein persönliches Netzwerk.</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StartupScreen({
  message,
  error,
  onRetry,
}: {
  message: string;
  error: StartupError | null;
  onRetry: () => void;
}) {
  return (
    <BrandedFrame>
      {error ? (
        <div className="rounded-xl border border-border bg-card p-5 text-center" role="alert">
          <AlertTriangle className="mx-auto mb-2 size-6 text-brand" aria-hidden="true" />
          <p className="font-medium">{error.message}</p>
          {error.detail && (
            <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground selectable">{error.detail}</p>
          )}
          <Button className="mt-4" onClick={onRetry}>
            <RotateCw className="size-4" />
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
          {message}
        </div>
      )}
    </BrandedFrame>
  );
}
