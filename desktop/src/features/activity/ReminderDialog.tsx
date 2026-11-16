import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContactSinglePicker } from "@/components/ContactPicker";
import { ErrorNote, Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, post, put } from "@/lib/api";
import { addDaysIso, localTimeZone, todayIso } from "@/lib/format";
import { useInvalidateAll } from "@/lib/queries";
import type { ContactRef, Reminder, ReminderInput } from "@/lib/types";

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return todayIso(target);
}

const PRESETS: { label: string; compute: (today: string) => string }[] = [
  { label: "Morgen", compute: (t) => addDaysIso(t, 1) },
  { label: "In 1 Woche", compute: (t) => addDaysIso(t, 7) },
  { label: "In 1 Monat", compute: (t) => addMonthsIso(t, 1) },
  { label: "In 3 Monaten", compute: (t) => addMonthsIso(t, 3) },
];

export function ReminderDialog({
  open,
  onOpenChange,
  contact,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: ContactRef | null;
  reminder?: Reminder | null;
}) {
  const invalidate = useInvalidateAll();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 7));
  const [dueTime, setDueTime] = useState("");
  const [target, setTarget] = useState<ContactRef | null>(contact ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title ?? "");
    setDescription(reminder?.description ?? "");
    setDueDate(reminder?.due_date ?? addDaysIso(todayIso(), 7));
    setDueTime(reminder?.due_time?.slice(0, 5) ?? "");
    setTarget(reminder?.contact ?? contact ?? null);
    setError(null);
  }, [open, reminder, contact]);

  const submit = async () => {
    if (!title.trim()) return setError("Bitte gib einen Titel ein.");
    if (!dueDate) return setError("Bitte gib ein Fälligkeitsdatum an.");
    const payload: ReminderInput = {
      contact_id: target?.id ?? null,
      interaction_id: reminder?.interaction_id ?? null,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate,
      due_time: dueTime ? `${dueTime}:00` : null,
      // Keep the original zone when editing so the wall-clock time stays as entered.
      timezone: reminder?.timezone ?? localTimeZone(),
    };
    setBusy(true);
    setError(null);
    try {
      if (reminder) await put(`/api/reminders/${reminder.id}`, payload, { tz: localTimeZone() });
      else await post("/api/reminders", payload, { tz: localTimeZone() });
      invalidate();
      toast.success(reminder ? "Erinnerung aktualisiert." : "Erinnerung angelegt.");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{reminder ? "Erinnerung bearbeiten" : "Erinnerung anlegen"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Titel" htmlFor="r-title">
            <Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Nachfassen zum Investitionsprojekt" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fällig am" htmlFor="r-date">
              <Input id="r-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </Field>
            <Field label="Uhrzeit (optional)" htmlFor="r-time" hint={dueTime ? undefined : "Ohne Uhrzeit: Mitteilung um 9:00 Uhr."}>
              <Input id="r-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => setDueDate(p.compute(todayIso()))}>
                {p.label}
              </Button>
            ))}
          </div>
          <Field label="Kontakt">
            <ContactSinglePicker value={target} onChange={setTarget} placeholder="Kontakt auswählen (optional)" />
          </Field>
          <Field label="Beschreibung (optional)" htmlFor="r-desc">
            <Textarea id="r-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <ErrorNote message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
