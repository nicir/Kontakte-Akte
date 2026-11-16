import { useQuery } from "@tanstack/react-query";
import { BellRing, Info, KeyRound, Loader2, Network, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardTitle, ErrorNote, Field, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { errorMessage, post, put } from "@/lib/api";
import { appInfo } from "@/lib/native";
import { useInvalidateAll, useSettings } from "@/lib/queries";
import type { Settings } from "@/lib/types";
import { BackupSection } from "./BackupSection";
import { ClassificationManager } from "./ClassificationManager";

const LOCK_OPTIONS = [0, 5, 10, 15, 30, 60, 120];

function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  };
  const submit = async () => {
    if (!next) return setError("Bitte gib ein neues Passwort ein.");
    if (next !== confirm) return setError("Die neuen Passwörter stimmen nicht überein.");
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/change-password", { current_password: current, new_password: next, new_password_confirm: confirm });
      toast.success("Master-Passwort geändert. Die Datenbank wurde neu verschlüsselt.");
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Master-Passwort ändern</DialogTitle>
          <DialogDescription>
            Die Datenbank wird mit dem neuen Passwort neu verschlüsselt. Ältere Sicherungen lassen sich weiterhin nur mit dem damaligen Passwort öffnen.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Aktuelles Passwort" htmlFor="pw-cur">
            <Input id="pw-cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="off" autoFocus />
          </Field>
          <Field label="Neues Passwort" htmlFor="pw-new">
            <Input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Neues Passwort bestätigen" htmlFor="pw-new2">
            <Input id="pw-new2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
          {error && <ErrorNote message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy || !current}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Passwort ändern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const invalidate = useInvalidateAll();
  const settings = useSettings();
  const info = useQuery({ queryKey: ["app-info"], queryFn: appInfo, staleTime: Infinity });
  const [pwOpen, setPwOpen] = useState(false);
  const [inactivity, setInactivity] = useState<string | null>(null);

  const update = async (patch: Partial<Settings>) => {
    try {
      await put("/api/settings", patch);
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const s = settings.data;

  return (
    <div className="space-y-5">
      <PageHeader title="Einstellungen" />

      <Card>
        <CardTitle icon={ShieldCheck}>Sicherheit</CardTitle>
        <div className="divide-y divide-border">
          <SettingRow title="Master-Passwort" description="Ohne dieses Passwort sind deine Daten nicht wiederherstellbar. Es gibt keinen Wiederherstellungsschlüssel.">
            <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
              <KeyRound className="size-4" /> Ändern …
            </Button>
          </SettingRow>
          <SettingRow title="Automatisch sperren" description="Nach dieser Zeit ohne Aktivität wird Kontakte-Akte gesperrt.">
            <Select value={String(s?.auto_lock_minutes ?? 15)} onValueChange={(v) => void update({ auto_lock_minutes: Number(v) })} disabled={!s}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCK_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m === 0 ? "Nie" : `Nach ${m} Minuten`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </Card>

      <Card>
        <CardTitle icon={BellRing}>Mitteilungen</CardTitle>
        <div className="divide-y divide-border">
          <SettingRow title="Erinnerungen als macOS-Mitteilung" description="Lokal erzeugt, solange Kontakte-Akte läuft (auch bei geschlossenem Fenster).">
            <Switch checked={s?.notifications_enabled ?? true} onCheckedChange={(v) => void update({ notifications_enabled: v })} disabled={!s} aria-label="Mitteilungen aktivieren" />
          </SettingRow>
          <SettingRow title="Details in Mitteilungen anzeigen" description="Titel und Name der Person. Im gesperrten Zustand werden nie Details angezeigt.">
            <Switch
              checked={s?.notification_show_details ?? true}
              onCheckedChange={(v) => void update({ notification_show_details: v })}
              disabled={!s || !s.notifications_enabled}
              aria-label="Details in Mitteilungen"
            />
          </SettingRow>
        </div>
      </Card>

      <Card>
        <CardTitle icon={Network}>Netzwerk</CardTitle>
        <SettingRow title="Wieder melden nach" description="Kontakte ohne Interaktion seit so vielen Tagen erscheinen auf dem Dashboard.">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const days = Number(inactivity);
              if (Number.isInteger(days) && days >= 7 && days <= 3650) {
                void update({ inactivity_days: days });
                setInactivity(null);
                toast.success("Gespeichert.");
              } else toast.error("Bitte gib einen Wert zwischen 7 und 3650 Tagen an.");
            }}
          >
            <Input
              type="number"
              min={7}
              max={3650}
              value={inactivity ?? String(s?.inactivity_days ?? 90)}
              onChange={(e) => setInactivity(e.target.value)}
              className="w-24"
              aria-label="Tage"
            />
            <span className="text-sm text-muted-foreground">Tagen</span>
            {inactivity !== null && (
              <Button type="submit" size="sm">
                Speichern
              </Button>
            )}
          </form>
        </SettingRow>
      </Card>

      <BackupSection />
      <ClassificationManager />

      <Card>
        <CardTitle icon={Info}>Über Kontakte-Akte</CardTitle>
        {info.error ? (
          <ErrorNote message={errorMessage(info.error)} />
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="grid grid-cols-[10rem_1fr] gap-2">
              <dt className="text-muted-foreground">Version</dt>
              <dd>{info.data?.version ?? "…"}</dd>
            </div>
            <div className="grid grid-cols-[10rem_1fr] gap-2">
              <dt className="text-muted-foreground">Datenbank</dt>
              <dd className="break-all selectable">{info.data?.database_file}</dd>
            </div>
            <div className="grid grid-cols-[10rem_1fr] gap-2">
              <dt className="text-muted-foreground">Sicherungen</dt>
              <dd className="break-all selectable">{info.data?.backups_dir}</dd>
            </div>
            <div className="grid grid-cols-[10rem_1fr] gap-2">
              <dt className="text-muted-foreground">Verschlüsselung</dt>
              <dd>SQLCipher (AES-256, PBKDF2-HMAC-SHA512) – gesamte Datenbank</dd>
            </div>
            <div className="grid grid-cols-[10rem_1fr] gap-2">
              <dt className="text-muted-foreground">Beenden</dt>
              <dd className="text-muted-foreground">{info.data?.shutdown_policy}</dd>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Lokal, offline, ohne Konto, ohne Telemetrie und ohne KI-Funktionen. Alle Daten bleiben auf diesem Mac.
            </p>
          </dl>
        )}
      </Card>

      <PasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}
