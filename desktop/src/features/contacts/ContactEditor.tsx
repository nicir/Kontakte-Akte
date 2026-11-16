import { ArrowLeft, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ContactSinglePicker } from "@/components/ContactPicker";
import { CountryMultiSelect, CountrySingleSelect } from "@/components/CountrySelect";
import { ConfirmDialog, ErrorNote, Field, Spinner } from "@/components/common";
import { SuggestInput, TagInput } from "@/components/TagInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, post, put } from "@/lib/api";
import {
  CHANNEL_LABEL_PRESETS,
  CHANNEL_LABELS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_PLACEHOLDERS,
  COUNTRY_KIND_LABELS,
} from "@/lib/labels";
import { useNavigation } from "@/lib/navigation";
import { useCategories, useContact, useInvalidateAll } from "@/lib/queries";
import type { ChannelKind, ClassificationKind, ContactDetail, ContactInput, ContactRef, CountryKind, RelationshipCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_CLASSIFICATIONS: ClassificationKind[] = [
  "profession",
  "specialization",
  "industry",
  "expertise",
  "responsibility",
  "topic",
  "interest",
  "shared_interest",
  "collaboration",
  "project",
  "tag",
  "language",
];

function emptyInput(): ContactInput {
  return {
    first_name: "",
    last_name: "",
    display_name: "",
    city: null,
    job_title: null,
    personal_notes: null,
    how_known: null,
    first_met_place: null,
    first_met_date: null,
    introduced_by_id: null,
    introduced_by_text: null,
    relationship_category_id: null,
    relationship_strength: null,
    relationship_notes: null,
    next_planned_interaction: null,
    current_organization: null,
    previous_organizations: [],
    countries: { nationality: [], residence: [], activity: [], expertise: [], interest: [] },
    classifications: Object.fromEntries(ALL_CLASSIFICATIONS.map((k) => [k, []])) as unknown as Record<ClassificationKind, string[]>,
    channels: [],
  };
}

function fromDetail(d: ContactDetail): ContactInput {
  const autoName = `${d.first_name} ${d.last_name}`.trim();
  return {
    first_name: d.first_name,
    last_name: d.last_name,
    display_name: d.display_name === autoName ? "" : d.display_name,
    city: d.city,
    job_title: d.job_title,
    personal_notes: d.personal_notes,
    how_known: d.how_known,
    first_met_place: d.first_met_place,
    first_met_date: d.first_met_date,
    introduced_by_id: d.introduced_by?.id ?? null,
    introduced_by_text: d.introduced_by_text,
    relationship_category_id: d.relationship_category?.id ?? null,
    relationship_strength: d.relationship_strength,
    relationship_notes: d.relationship_notes,
    next_planned_interaction: d.next_planned_interaction,
    current_organization: d.current_organization,
    previous_organizations: d.previous_organizations,
    countries: Object.fromEntries(
      (Object.keys(d.countries) as CountryKind[]).map((k) => [k, d.countries[k].map((c) => c.code)]),
    ) as Record<CountryKind, string[]>,
    classifications: { ...emptyInput().classifications, ...d.classifications },
    channels: d.channels.map((c) => ({ kind: c.kind, label: c.label, value: c.value })),
  };
}

function hasAny(values: (string | null | number | undefined | unknown[])[]): boolean {
  return values.some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== ""));
}

function Section({
  title,
  description,
  defaultOpen,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && !open && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-4 border-t border-border px-5 py-5">{children}</div>}
    </section>
  );
}

function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  categories: RelationshipCategory[];
}) {
  const invalidate = useInvalidateAll();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const create = async () => {
    try {
      const created = await post<RelationshipCategory>("/api/relationship-categories", { name });
      invalidate();
      onChange(created.id);
      setAdding(false);
      setName("");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  if (adding)
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Neue Kategorie"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (name.trim()) void create();
            }
            if (e.key === "Escape") setAdding(false);
          }}
        />
        <Button type="button" onClick={() => void create()} disabled={!name.trim()}>
          Anlegen
        </Button>
      </div>
    );
  return (
    <Select
      value={value === null ? "none" : String(value)}
      onValueChange={(v) => {
        if (v === "__new") setAdding(true);
        else onChange(v === "none" ? null : Number(v));
      }}
    >
      <SelectTrigger className="w-full bg-card" id="category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Keine Angabe</SelectItem>
        {categories.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            {c.name}
          </SelectItem>
        ))}
        <SelectItem value="__new">+ Neue Kategorie …</SelectItem>
      </SelectContent>
    </Select>
  );
}

function StrengthPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Beziehungsstärke">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`Stärke ${n} von 5`}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "size-6 rounded-full border transition-colors",
            value !== null && n <= value ? "border-brand bg-brand" : "border-border bg-card hover:border-brand-secondary",
          )}
        />
      ))}
      {value !== null && <span className="ml-2 text-xs text-muted-foreground">{value} / 5</span>}
    </div>
  );
}

function ChannelsEditor({
  channels,
  onChange,
}: {
  channels: ContactInput["channels"];
  onChange: (c: ContactInput["channels"]) => void;
}) {
  const add = (kind: ChannelKind) =>
    onChange([...channels, { kind, label: kind === "email" ? "Arbeit" : kind === "phone" ? "Mobil" : null, value: "" }]);
  const set = (i: number, patch: Partial<ContactInput["channels"][number]>) =>
    onChange(channels.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const placeholder: Record<ChannelKind, string> = {
    email: "name@beispiel.de",
    phone: "+49 …",
    whatsapp: "+49 …",
    linkedin: "https://www.linkedin.com/in/…",
    website: "https://…",
    other: "z. B. Signal, Telegram, Xing",
  };
  return (
    <div className="space-y-2">
      {channels.map((c, i) => (
        <div key={i} className="grid grid-cols-[9rem_8rem_1fr_auto] items-center gap-2">
          <Select value={c.kind} onValueChange={(v) => set(i, { kind: v as ChannelKind })}>
            <SelectTrigger className="w-full bg-card" aria-label="Art">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CHANNEL_LABELS) as ChannelKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {CHANNEL_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SuggestInput
            value={c.label ?? ""}
            onChange={(v) => set(i, { label: v || null })}
            placeholder="Bezeichnung"
            source={{ options: CHANNEL_LABEL_PRESETS }}
          />
          <Input
            value={c.value}
            onChange={(e) => set(i, { value: e.target.value })}
            placeholder={placeholder[c.kind]}
            aria-label={`${CHANNEL_LABELS[c.kind]} – Wert`}
            className="bg-card"
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(channels.filter((_, idx) => idx !== i))} aria-label="Eintrag entfernen">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        {(["email", "phone", "whatsapp", "linkedin", "website", "other"] as ChannelKind[]).map((k) => (
          <Button key={k} type="button" variant="outline" size="sm" onClick={() => add(k)}>
            <Plus className="size-3.5" />
            {CHANNEL_LABELS[k]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function EditorForm({ initial, detail }: { initial: ContactInput; detail?: ContactDetail }) {
  const { back, replace } = useNavigation();
  const invalidate = useInvalidateAll();
  const categories = useCategories();
  const [form, setForm] = useState<ContactInput>(initial);
  const [introducedBy, setIntroducedBy] = useState<ContactRef | null>(detail?.introduced_by ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  const isNew = !detail;

  const set = <K extends keyof ContactInput>(key: K, value: ContactInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setText = (key: keyof ContactInput) => (e: { target: { value: string } }) =>
    set(key, (e.target.value || null) as never);
  const setCountries = (kind: CountryKind, values: string[]) =>
    setForm((f) => ({ ...f, countries: { ...f.countries, [kind]: values } }));
  const setClass = (kind: ClassificationKind, values: string[]) =>
    setForm((f) => ({ ...f, classifications: { ...f.classifications, [kind]: values } }));

  const hasName = !!(form.first_name.trim() || form.last_name.trim() || form.display_name.trim());

  const save = async () => {
    if (!hasName) {
      setError("Bitte gib mindestens einen Namen ein.");
      document.getElementById("first_name")?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    const payload: ContactInput = {
      ...form,
      introduced_by_id: introducedBy?.id ?? null,
      channels: form.channels.filter((c) => c.value.trim()),
    };
    try {
      const saved = isNew
        ? await post<ContactDetail>("/api/contacts", payload)
        : await put<ContactDetail>(`/api/contacts/${detail.id}`, payload);
      invalidate();
      toast.success(isNew ? "Kontakt angelegt." : "Änderungen gespeichert.");
      replace({ name: "contact", id: saved.id });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cancel = () => (dirty ? setConfirmDiscard(true) : back());
  const c = form.classifications;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4"
    >
      <div className="mb-6 flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={cancel} aria-label="Zurück">
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isNew ? "Neuer Kontakt" : `${detail.display_name} bearbeiten`}
        </h1>
      </div>

      <Section title="Persönliche Daten" defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vorname" htmlFor="first_name">
            <Input id="first_name" autoFocus={isNew} value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className="bg-card" />
          </Field>
          <Field label="Nachname" htmlFor="last_name">
            <Input id="last_name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className="bg-card" />
          </Field>
          <Field label="Anzeigename (optional)" htmlFor="display_name" hint="Leer lassen für „Vorname Nachname“.">
            <Input id="display_name" value={form.display_name} onChange={(e) => set("display_name", e.target.value)} className="bg-card" />
          </Field>
          <Field label="Nationalität(en)">
            <CountryMultiSelect values={form.countries.nationality} onChange={(v) => setCountries("nationality", v)} label="Nationalität" />
          </Field>
          <Field label="Wohnsitzland" htmlFor="residence">
            <CountrySingleSelect
              id="residence"
              value={form.countries.residence[0] ?? null}
              onChange={(v) => setCountries("residence", v ? [v] : [])}
            />
          </Field>
          <Field label="Wohnort (Stadt)" htmlFor="city">
            <Input id="city" value={form.city ?? ""} onChange={setText("city")} className="bg-card" />
          </Field>
          <Field label="Sprachen" className="col-span-2">
            <TagInput values={c.language} onChange={(v) => setClass("language", v)} source={{ kind: "language" }} placeholder="z. B. Englisch, Hindi" ariaLabel="Sprachen" />
          </Field>
        </div>
      </Section>

      <Section title="Beruf & Unternehmen" defaultOpen>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Beruf">
            <TagInput values={c.profession} onChange={(v) => setClass("profession", v)} source={{ kind: "profession" }} placeholder={CLASSIFICATION_PLACEHOLDERS.profession} ariaLabel="Beruf" />
          </Field>
          <Field label="Position / Jobtitel" htmlFor="job_title">
            <Input id="job_title" value={form.job_title ?? ""} onChange={setText("job_title")} placeholder="z. B. Partner" className="bg-card" />
          </Field>
          <Field label="Aktuelles Unternehmen" htmlFor="org">
            <SuggestInput id="org" value={form.current_organization ?? ""} onChange={(v) => set("current_organization", v || null)} source={{ organizations: true }} placeholder="z. B. Sharma & Partners" />
          </Field>
          <Field label="Frühere Unternehmen">
            <TagInput values={form.previous_organizations} onChange={(v) => set("previous_organizations", v)} source={{ organizations: true }} ariaLabel="Frühere Unternehmen" />
          </Field>
          <Field label="Branchen">
            <TagInput values={c.industry} onChange={(v) => setClass("industry", v)} source={{ kind: "industry" }} placeholder={CLASSIFICATION_PLACEHOLDERS.industry} ariaLabel="Branchen" />
          </Field>
          <Field label="Spezialisierungen">
            <TagInput values={c.specialization} onChange={(v) => setClass("specialization", v)} source={{ kind: "specialization" }} placeholder={CLASSIFICATION_PLACEHOLDERS.specialization} ariaLabel="Spezialisierungen" />
          </Field>
          <Field label="Verantwortungsbereiche" className="col-span-2">
            <TagInput values={c.responsibility} onChange={(v) => setClass("responsibility", v)} source={{ kind: "responsibility" }} placeholder={CLASSIFICATION_PLACEHOLDERS.responsibility} ariaLabel="Verantwortungsbereiche" />
          </Field>
        </div>
      </Section>

      <Section
        title="Länder"
        description="Tätigkeits-, Expertise- und Interessensländer"
        defaultOpen={isNew || hasAny([form.countries.activity, form.countries.expertise, form.countries.interest])}
      >
        {(["activity", "expertise", "interest"] as CountryKind[]).map((kind) => (
          <Field key={kind} label={COUNTRY_KIND_LABELS[kind]}>
            <CountryMultiSelect values={form.countries[kind]} onChange={(v) => setCountries(kind, v)} label={COUNTRY_KIND_LABELS[kind]} />
          </Field>
        ))}
        <p className="text-xs text-muted-foreground">Nationalität und Wohnsitz findest du unter „Persönliche Daten“.</p>
      </Section>

      <Section
        title="Beziehung"
        description="Wie ihr euch kennt, erstes Treffen, Kategorie"
        defaultOpen={!isNew && hasAny([form.how_known, form.first_met_place, form.first_met_date, form.relationship_category_id, introducedBy?.id, form.introduced_by_text])}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Woher kennst du die Person?" htmlFor="how_known" className="col-span-2">
            <Textarea id="how_known" rows={2} value={form.how_known ?? ""} onChange={setText("how_known")} className="bg-card" />
          </Field>
          <Field label="Wo habt ihr euch kennengelernt?" htmlFor="met_place">
            <Input id="met_place" value={form.first_met_place ?? ""} onChange={setText("first_met_place")} placeholder="z. B. Konferenz in Singapur" className="bg-card" />
          </Field>
          <Field label="Wann?" htmlFor="met_date">
            <Input id="met_date" type="date" value={form.first_met_date ?? ""} onChange={setText("first_met_date")} className="bg-card" />
          </Field>
          <Field label="Vorgestellt durch (Kontakt)">
            <ContactSinglePicker value={introducedBy} onChange={setIntroducedBy} excludeIds={detail ? [detail.id] : []} placeholder="Kontakt auswählen" />
          </Field>
          <Field label="… oder Name (falls kein Kontakt)" htmlFor="intro_text">
            <Input id="intro_text" value={form.introduced_by_text ?? ""} onChange={setText("introduced_by_text")} className="bg-card" />
          </Field>
          <Field label="Beziehungskategorie" htmlFor="category">
            <CategorySelect value={form.relationship_category_id} onChange={(v) => set("relationship_category_id", v)} categories={categories.data ?? []} />
          </Field>
          <Field label="Beziehungsstärke (optional)">
            <StrengthPicker value={form.relationship_strength} onChange={(v) => set("relationship_strength", v)} />
          </Field>
          <Field label="Nächste geplante Interaktion" htmlFor="next">
            <Input id="next" type="date" value={form.next_planned_interaction ?? ""} onChange={setText("next_planned_interaction")} className="bg-card" />
          </Field>
          <Field label="Notizen zur Beziehung" htmlFor="rel_notes" className="col-span-2">
            <Textarea id="rel_notes" rows={2} value={form.relationship_notes ?? ""} onChange={setText("relationship_notes")} className="bg-card" />
          </Field>
        </div>
      </Section>

      <Section
        title="Expertise & Themen"
        description="Expertise, Themen, Interessen, Kooperationen, Tags"
        defaultOpen={!isNew && hasAny(["expertise", "topic", "interest", "shared_interest", "collaboration", "project", "tag"].map((k) => c[k as ClassificationKind]))}
      >
        <div className="grid grid-cols-2 gap-4">
          {(["expertise", "topic", "interest", "shared_interest", "collaboration", "project", "tag"] as ClassificationKind[]).map((kind) => (
            <Field key={kind} label={CLASSIFICATION_LABELS[kind]}>
              <TagInput values={c[kind]} onChange={(v) => setClass(kind, v)} source={{ kind }} placeholder={CLASSIFICATION_PLACEHOLDERS[kind]} ariaLabel={CLASSIFICATION_LABELS[kind]} />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Kontaktdaten" description="E-Mail, Telefon, WhatsApp, LinkedIn, Website" defaultOpen={isNew || form.channels.length > 0}>
        <ChannelsEditor channels={form.channels} onChange={(v) => set("channels", v)} />
      </Section>

      <Section title="Notizen" description="Persönliche Notizen" defaultOpen={!isNew && !!form.personal_notes}>
        <Textarea rows={6} value={form.personal_notes ?? ""} onChange={setText("personal_notes")} aria-label="Persönliche Notizen" className="bg-card" />
      </Section>

      {error && <ErrorNote message={error} />}

      <div className="sticky bottom-0 -mx-8 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-8 py-3 backdrop-blur">
        <span className="mr-auto text-xs text-muted-foreground">Nur ein Name ist erforderlich · ⌘S speichert</span>
        <Button type="button" variant="outline" onClick={cancel}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {isNew ? "Kontakt anlegen" : "Speichern"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Änderungen verwerfen?"
        description="Deine ungespeicherten Eingaben gehen verloren."
        confirmLabel="Verwerfen"
        onConfirm={() => {
          setConfirmDiscard(false);
          back();
        }}
      />
    </form>
  );
}

export function ContactEditorPage({ id }: { id?: string }) {
  const { data, isLoading, error } = useContact(id);
  const initial = useMemo(() => (data ? fromDetail(data) : emptyInput()), [data]);
  if (id && isLoading) return <Spinner />;
  if (id && error) return <ErrorNote message={errorMessage(error)} />;
  return <EditorForm key={id ?? "new"} initial={initial} detail={data} />;
}
