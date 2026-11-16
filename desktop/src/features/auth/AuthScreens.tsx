import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ErrorNote } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandedFrame } from "@/features/startup/StartupScreen";
import { errorMessage, post } from "@/lib/api";

function PasswordInput({
  id,
  value,
  onChange,
  autoFocus,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  label: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="h-10 bg-card pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function SetupScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) return setError("Bitte gib ein Master-Passwort ein.");
    if (password !== confirm) return setError("Die Passwörter stimmen nicht überein.");
    if (!acknowledged) return setError("Bitte bestätige den Hinweis zur Passwort-Wiederherstellung.");
    setBusy(true);
    try {
      await post("/api/auth/setup", { password, password_confirm: confirm });
      setPassword("");
      setConfirm("");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrandedFrame>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Master-Passwort festlegen</h2>
            <p className="text-sm text-muted-foreground">
              Deine Daten werden lokal auf diesem Mac verschlüsselt gespeichert. Lange Passphrasen mit Leerzeichen sind
              ausdrücklich erlaubt.
            </p>
          </div>
        </div>
        <PasswordInput id="pw" label="Master-Passwort" value={password} onChange={setPassword} autoFocus />
        <PasswordInput id="pw2" label="Passwort bestätigen" value={confirm} onChange={setConfirm} />
        <label className="flex items-start gap-2 rounded-lg bg-brand-light p-3 text-sm text-brand-dark">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 accent-[var(--brand)]"
          />
          <span>
            Ich habe verstanden: Ohne dieses Passwort sind meine Daten <strong>nicht wiederherstellbar</strong>. Es gibt
            keinen Wiederherstellungsschlüssel.
          </span>
        </label>
        {error && <ErrorNote message={error} />}
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Verschlüsselte Datenbank anlegen
        </Button>
      </form>
    </BrandedFrame>
  );
}

export function UnlockScreen({ onUnlocked, notice }: { onUnlocked: () => void; notice?: string | null }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError(null);
    setBusy(true);
    try {
      await post("/api/auth/unlock", { password });
      setPassword("");
      onUnlocked();
    } catch (err) {
      setError(errorMessage(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrandedFrame>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-brand" aria-hidden="true" />
          <h2 className="font-semibold">Entsperren</h2>
        </div>
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        <PasswordInput id="unlock" label="Master-Passwort" value={password} onChange={setPassword} autoFocus />
        {error && <ErrorNote message={error} />}
        <Button type="submit" className="h-10 w-full" disabled={busy || !password}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Entsperren
        </Button>
      </form>
    </BrandedFrame>
  );
}
