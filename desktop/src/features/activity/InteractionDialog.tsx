import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContactMultiPicker } from "@/components/ContactPicker";
import { ErrorNote, Field } from "@/components/common";
import { TagInput } from "@/components/TagInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, post, put } from "@/lib/api";
import { addDaysIso, localTimeZone, todayIso } from "@/lib/format";
import { INTERACTION_LABELS } from "@/lib/labels";
import { useInvalidateAll } from "@/lib/queries";
import type { ContactRef, Interaction, InteractionInput, InteractionKind } from "@/lib/types";

export function InteractionDialog({
  open,
  onOpenChange,
  initialParticipants,
  interaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialParticipants: ContactRef[];
  interaction?: Interaction | null;
}) {
  const invalidate = useInvalidateAll();
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<InteractionKind>("meeting");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState<ContactRef[]>(initialParticipants);
  const [topics, setTopics] = useState<string[]>([]);
  const [followUp, setFollowUp] = useState(false);
  const [followTitle, setFollowTitle] = useState("");
  const [followDate, setFollowDate] = useState(addDaysIso(todayIso(), 14));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(interaction?.occurred_on ?? todayIso());
    setTime(interaction?.occurred_time?.slice(0, 5) ?? "");
    setKind(interaction?.kind ?? "meeting");
    setTitle(interaction?.title ?? "");
    setDescription(interaction?.description ?? "");
    setLocation(interaction?.location ?? "");
    setParticipants(interaction?.participants ?? initialParticipants);
    setTopics(interaction?.topics ?? []);
    setFollowUp(false);
    setFollowTitle("");
    setFollowDate(addDaysIso(todayIso(), 14));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, interaction]);

  const submit = async () => {
    const effectiveTitle = title.trim() || INTERACTION_LABELS[kind];
    if (participants.length === 0) return setError("Bitte wähle mindestens einen Kontakt aus.");
    if (!date) return setError("Bitte gib ein Datum an.");
    if (followUp && !followDate) return setError("Bitte gib ein Fälligkeitsdatum für die Erinnerung an.");
    const payload: InteractionInput = {
      occurred_on: date,
      occurred_time: time ? `${time}:00` : null,
      kind,
      title: effectiveTitle,
      description: description.trim() || null,
      location: location.trim() || null,
      participant_ids: participants.map((p) => p.id),
      topics,
      follow_up: followUp
        ? {
            title: followTitle.trim() || `Nachfassen: ${effectiveTitle}`,
            description: null,
            due_date: followDate,
            due_time: null,
            timezone: localTimeZone(),
            contact_id: participants[0]?.id ?? null,
          }
        : null,
    };
    setBusy(true);
    setError(null);
    try {
      if (interaction) await put(`/api/interactions/${interaction.id}`, payload);
      else await post("/api/interactions", payload);
      invalidate();
      toast.success(interaction ? "Interaktion aktualisiert." : "Interaktion gespeichert.");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{interaction ? "Interaktion bearbeiten" : "Interaktion dokumentieren"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="Art" htmlFor="i-kind">
              <Select value={kind} onValueChange={(v) => setKind(v as InteractionKind)}>
                <SelectTrigger id="i-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INTERACTION_LABELS) as InteractionKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {INTERACTION_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Datum" htmlFor="i-date">
              <Input id="i-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Uhrzeit (optional)" htmlFor="i-time">
              <Input id="i-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Titel" htmlFor="i-title">
            <Input id="i-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={INTERACTION_LABELS[kind]} autoFocus />
          </Field>
          <Field label="Beschreibung" htmlFor="i-desc">
            <Textarea id="i-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Worüber habt ihr gesprochen?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ort (optional)" htmlFor="i-loc">
              <Input id="i-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
            <Field label="Besprochene Themen">
              <TagInput values={topics} onChange={setTopics} source={{ kind: "topic" }} placeholder="Thema hinzufügen" ariaLabel="Besprochene Themen" />
            </Field>
          </div>
          <Field label="Beteiligte Kontakte">
            <ContactMultiPicker values={participants} onChange={setParticipants} label="Kontakt" />
          </Field>
          {!interaction && (
            <div className="rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} className="accent-[var(--brand)]" />
                Follow-up-Erinnerung anlegen
              </label>
              {followUp && (
                <div className="mt-3 grid grid-cols-[1fr_10rem] gap-3">
                  <Input value={followTitle} onChange={(e) => setFollowTitle(e.target.value)} placeholder={`Nachfassen: ${title || INTERACTION_LABELS[kind]}`} aria-label="Titel der Erinnerung" />
                  <Input type="date" value={followDate} onChange={(e) => setFollowDate(e.target.value)} aria-label="Fällig am" />
                </div>
              )}
            </div>
          )}
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
