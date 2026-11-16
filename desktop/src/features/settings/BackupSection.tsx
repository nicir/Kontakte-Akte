import { Archive, Download, FolderOpen, Loader2, MoreHorizontal, ShieldCheck, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardTitle, ConfirmDialog, ErrorNote, Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { del, errorMessage, post } from "@/lib/api";
import { formatBytes, formatTimestamp } from "@/lib/format";
import { BACKUP_KIND_LABELS } from "@/lib/labels";
import { exportBackup, importBackup } from "@/lib/native";
import { useBackups, useInvalidateAll } from "@/lib/queries";
import type { BackupFile, BackupVerify } from "@/lib/types";

type Target = { location: BackupFile["location"]; file_name: string };

function RestoreDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState<BackupVerify | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"verify" | "restore" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [lastTarget, setLastTarget] = useState<Target | null>(null);
  if (target !== lastTarget) {
    setLastTarget(target);
    setPassword("");
    setVerified(null);
    setError(null);
    setConfirmed(false);
  }
  if (!target) return null;

  const body = () => ({ ...target, password: password || null });
  const verify = async () => {
    setBusy("verify");
    setError(null);
    try {
      setVerified(await post<BackupVerify>("/api/backups/verify", body()));
    } catch (err) {
      setVerified(null);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const restore = async () => {
    setBusy("restore");
    setError(null);
    try {
      const result = await post<{ safety_backup: string; contacts: number }>("/api/backups/restore", body());
      invalidate();
      toast.success(`Sicherung wiederhergestellt (${result.contacts} Kontakte). Der vorherige Stand wurde als „${result.safety_backup}“ gesichert.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sicherung wiederherstellen</DialogTitle>
          <DialogDescription className="break-all">{target.file_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Passwort der Sicherung" htmlFor="b-pw" hint="Leer lassen, wenn die Sicherung mit deinem aktuellen Master-Passwort erstellt wurde.">
            <Input id="b-pw" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setVerified(null); }} autoComplete="off" />
          </Field>
          {verified && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="size-4" /> Sicherung geprüft – Verschlüsselung und Integrität in Ordnung
              </div>
              <div className="mt-1">
                {verified.contacts} Kontakte · {verified.interactions} Interaktionen · {verified.reminders} Erinnerungen · {formatBytes(verified.size_bytes)}
              </div>
              {!verified.compatible && <div className="mt-1 text-red-700">Diese Sicherung stammt von einer neueren Version und kann nicht wiederhergestellt werden.</div>}
            </div>
          )}
          {verified?.compatible && (
            <label className="flex items-start gap-2 rounded-lg bg-brand-light p-3 text-sm text-brand-dark">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-[var(--brand)]" />
              <span>
                Ich möchte die aktuellen Daten durch diese Sicherung ersetzen. Der aktuelle Stand wird vorher automatisch verschlüsselt gesichert.
                Dein aktuelles Master-Passwort bleibt gültig.
              </span>
            </label>
          )}
          {error && <ErrorNote message={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          {!verified ? (
            <Button onClick={() => void verify()} disabled={busy !== null}>
              {busy === "verify" && <Loader2 className="size-4 animate-spin" />}
              Sicherung prüfen
            </Button>
          ) : (
            <Button onClick={() => void restore()} disabled={!confirmed || !verified.compatible || busy !== null} className="bg-red-600 hover:bg-red-700">
              {busy === "restore" && <Loader2 className="size-4 animate-spin" />}
              Wiederherstellen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BackupSection() {
  const invalidate = useInvalidateAll();
  const backups = useBackups();
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<BackupFile | null>(null);

  const create = async () => {
    setCreating(true);
    try {
      const backup = await post<BackupFile>("/api/backups");
      invalidate();
      toast.success("Verschlüsselte Sicherung erstellt.");
      const dest = await exportBackup(backup.file_name);
      if (dest) toast.success(`Gespeichert unter ${dest}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const doImport = async () => {
    try {
      const name = await importBackup();
      if (name) {
        invalidate();
        setRestoreTarget({ location: "import", file_name: name });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const verifyQuick = async (b: BackupFile) => {
    try {
      const r = await post<BackupVerify>("/api/backups/verify", { location: b.location, file_name: b.file_name });
      toast.success(`Sicherung in Ordnung: ${r.contacts} Kontakte, ${r.interactions} Interaktionen, ${r.reminders} Erinnerungen.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardTitle icon={Archive}>Datensicherung</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        Sicherungen sind vollständige, mit SQLCipher verschlüsselte Kopien inklusive Profilbildern. Sie lassen sich nur mit dem Master-Passwort öffnen,
        das zum Zeitpunkt der Sicherung galt.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => void create()} disabled={creating}>
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Sicherung erstellen …
        </Button>
        <Button variant="outline" onClick={() => void doImport()}>
          <Upload className="size-4" /> Sicherung wiederherstellen …
        </Button>
      </div>
      {backups.data && backups.data.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {backups.data.map((b) => (
            <li key={`${b.location}/${b.file_name}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  {BACKUP_KIND_LABELS[b.kind]} · {formatTimestamp(b.modified_at)} · {formatBytes(b.size_bytes)}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="Aktionen">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {b.location === "backups" && (
                    <DropdownMenuItem
                      onSelect={async () => {
                        try {
                          const dest = await exportBackup(b.file_name);
                          if (dest) toast.success(`Gespeichert unter ${dest}`);
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      Speichern unter …
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => void verifyQuick(b)}>Integrität prüfen</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRestoreTarget({ location: b.location, file_name: b.file_name })}>Wiederherstellen …</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600" onSelect={() => setDeleting(b)}>
                    Löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      <RestoreDialog target={restoreTarget} onClose={() => setRestoreTarget(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Sicherung löschen?"
        description={deleting ? `${deleting.file_name} wird aus dem Sicherungsordner gelöscht.` : ""}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del(`/api/backups/${deleting.location}/${deleting.file_name}`);
            invalidate();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setDeleting(null);
          }
        }}
      />
    </Card>
  );
}
