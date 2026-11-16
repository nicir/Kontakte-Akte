import { CalendarRange, Filter, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCountryName, CountryMultiSelect } from "@/components/CountrySelect";
import { TagInput } from "@/components/TagInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatShortDate } from "@/lib/format";
import { FILTER_FIELDS, filterFieldDef } from "@/lib/labels";
import { useCategories } from "@/lib/queries";
import type { ClassificationKind, ContactQuery, FilterCondition, FilterField } from "@/lib/types";
import { cn } from "@/lib/utils";
import { activeFilterCount } from "./searchState";

type DateFilter = "first_met" | "last_interaction";

function ValueEditor({ field, values, onChange }: { field: FilterField; values: string[]; onChange: (v: string[]) => void }) {
  const def = filterFieldDef(field);
  const categories = useCategories();
  if (def.kind === "country") return <CountryMultiSelect values={values} onChange={onChange} label={def.label} />;
  if (def.kind === "organization")
    return <TagInput values={values} onChange={onChange} source={{ organizations: true }} placeholder="Unternehmen eingeben" ariaLabel={def.label} freeTextLabel={(v) => `Nach „${v}“ suchen`} />;
  if (def.kind === "category")
    return (
      <div className="grid grid-cols-2 gap-2">
        {(categories.data ?? []).map((c) => {
          const checked = values.includes(String(c.id));
          return (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                className="accent-[var(--brand)]"
                onChange={() =>
                  onChange(checked ? values.filter((v) => v !== String(c.id)) : [...values, String(c.id)])
                }
              />
              {c.name}
            </label>
          );
        })}
      </div>
    );
  return (
    <TagInput
      values={values}
      onChange={onChange}
      source={{ kind: field as ClassificationKind }}
      placeholder="Begriff eingeben oder auswählen"
      ariaLabel={def.label}
      freeTextLabel={(v) => `Nach „${v}“ suchen`}
    />
  );
}

function ConditionDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: FilterCondition | null;
  onSave: (c: FilterCondition) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<string[]>(initial?.values ?? []);
  const [match, setMatch] = useState<"any" | "all">(initial?.match ?? "any");
  useEffect(() => {
    setValues(initial?.values ?? []);
    setMatch(initial?.match ?? "any");
  }, [initial]);
  if (!initial) return null;
  const def = filterFieldDef(initial.field);
  const textual = def.kind === "classification" || def.kind === "organization";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Filter: {def.label}</DialogTitle>
          <DialogDescription>
            {textual
              ? "Treffer enthalten den Begriff (z. B. findet „Steuerrecht“ auch „Indisches Steuerrecht“)."
              : "Wähle einen oder mehrere Werte."}
          </DialogDescription>
        </DialogHeader>
        <ValueEditor field={initial.field} values={values} onChange={setValues} />
        {values.length > 1 && (
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">Mehrere Werte verknüpfen mit</legend>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["any", "all"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMatch(m)}
                  aria-pressed={match === m}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm",
                    match === m ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "any" ? "ODER – einer davon" : "UND – alle"}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => onSave({ field: initial.field, values, match })} disabled={values.length === 0}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DateDialog({
  which,
  query,
  onSave,
  onClose,
}: {
  which: DateFilter | null;
  query: ContactQuery;
  onSave: (from: string | null, to: string | null) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    if (!which) return;
    setFrom((which === "first_met" ? query.first_met_from : query.last_interaction_from) ?? "");
    setTo((which === "first_met" ? query.first_met_to : query.last_interaction_to) ?? "");
  }, [which, query]);
  if (!which) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{which === "first_met" ? "Erstes Treffen" : "Letzte Interaktion"}</DialogTitle>
          <DialogDescription>Zeitraum eingrenzen (beide Angaben optional).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="df-from">Von</Label>
            <Input id="df-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="df-to">Bis</Label>
            <Input id="df-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => onSave(from || null, to || null)} disabled={!from && !to}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pill({ label, children, onEdit, onRemove }: { label: string; children: React.ReactNode; onEdit?: () => void; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-brand-light py-1 pr-1 pl-2.5 text-sm">
      <span className="font-medium text-brand-dark">{label}:</span>
      <span className="text-foreground">{children}</span>
      {onEdit && (
        <button type="button" onClick={onEdit} className="rounded p-0.5 text-brand-dark/70 hover:bg-orange-200/60" aria-label={`${label} bearbeiten`}>
          <Pencil className="size-3" />
        </button>
      )}
      <button type="button" onClick={onRemove} className="rounded p-0.5 text-brand-dark/70 hover:bg-orange-200/60" aria-label={`${label}-Filter entfernen`}>
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function Connector({ children }: { children: string }) {
  return <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">{children}</span>;
}

export function FilterBar({ query, update }: { query: ContactQuery; update: (patch: Partial<ContactQuery>) => void }) {
  const [editing, setEditing] = useState<{ condition: FilterCondition; index: number | null } | null>(null);
  const [dateEditing, setDateEditing] = useState<DateFilter | null>(null);
  const countryName = useCountryName();
  const categories = useCategories();
  const categoryName = (id: string) => categories.data?.find((c) => String(c.id) === id)?.name ?? id;

  const display = (c: FilterCondition) => {
    const def = filterFieldDef(c.field);
    const names = c.values.map((v) => (def.kind === "country" ? countryName(v) : def.kind === "category" ? categoryName(v) : `„${v}“`));
    return names.join(c.match === "all" ? " und " : " oder ");
  };

  const saveCondition = (condition: FilterCondition) => {
    const filters = [...query.filters];
    if (editing?.index === null || editing?.index === undefined) {
      const existing = filters.findIndex((f) => f.field === condition.field);
      if (existing >= 0) filters[existing] = condition;
      else filters.push(condition);
    } else {
      filters[editing.index] = condition;
    }
    update({ filters });
    setEditing(null);
  };

  const groups = Array.from(new Set(FILTER_FIELDS.map((f) => f.group)));
  const pills: React.ReactNode[] = [];
  query.filters.forEach((c, index) => {
    pills.push(
      <Pill
        key={`f-${c.field}`}
        label={filterFieldDef(c.field).label}
        onEdit={() => setEditing({ condition: c, index })}
        onRemove={() => update({ filters: query.filters.filter((_, i) => i !== index) })}
      >
        {display(c)}
      </Pill>,
    );
  });
  if (query.first_met_from || query.first_met_to)
    pills.push(
      <Pill key="first_met" label="Erstes Treffen" onEdit={() => setDateEditing("first_met")} onRemove={() => update({ first_met_from: null, first_met_to: null })}>
        {query.first_met_from ? `ab ${formatShortDate(query.first_met_from)}` : ""} {query.first_met_to ? `bis ${formatShortDate(query.first_met_to)}` : ""}
      </Pill>,
    );
  if (query.last_interaction_from || query.last_interaction_to)
    pills.push(
      <Pill
        key="last"
        label="Letzte Interaktion"
        onEdit={() => setDateEditing("last_interaction")}
        onRemove={() => update({ last_interaction_from: null, last_interaction_to: null })}
      >
        {query.last_interaction_from ? `ab ${formatShortDate(query.last_interaction_from)}` : ""}{" "}
        {query.last_interaction_to ? `bis ${formatShortDate(query.last_interaction_to)}` : ""}
      </Pill>,
    );
  if (query.has_open_reminder !== null)
    pills.push(
      <Pill key="rem" label="Offene Erinnerung" onRemove={() => update({ has_open_reminder: null })}>
        {query.has_open_reminder ? "ja" : "nein"}
      </Pill>,
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="size-4" />
              Filter hinzufügen
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
            {groups.map((group, gi) => (
              <DropdownMenuGroup key={group}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground">{group}</DropdownMenuLabel>
                {FILTER_FIELDS.filter((f) => f.group === group).map((f) => (
                  <DropdownMenuItem
                    key={f.field}
                    onSelect={() => {
                      const index = query.filters.findIndex((c) => c.field === f.field);
                      setEditing(
                        index >= 0
                          ? { condition: query.filters[index]!, index }
                          : { condition: { field: f.field, values: [], match: "any" }, index: null },
                      );
                    }}
                  >
                    {f.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Zeit & Erinnerungen</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setDateEditing("first_met")}>
              <CalendarRange className="size-4" /> Erstes Treffen
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDateEditing("last_interaction")}>
              <CalendarRange className="size-4" /> Letzte Interaktion
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => update({ has_open_reminder: true })}>Mit offener Erinnerung</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {activeFilterCount(query) > 1 && (
          <span className="text-xs text-muted-foreground">Alle Filter müssen zutreffen (UND).</span>
        )}
      </div>

      {pills.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Aktive Filter">
          {pills.flatMap((pill, i) => (i === 0 ? [pill] : [<Connector key={`c-${i}`}>UND</Connector>, pill]))}
        </div>
      )}

      <ConditionDialog initial={editing?.condition ?? null} onSave={saveCondition} onClose={() => setEditing(null)} />
      <DateDialog
        which={dateEditing}
        query={query}
        onClose={() => setDateEditing(null)}
        onSave={(from, to) => {
          if (dateEditing === "first_met") update({ first_met_from: from, first_met_to: to });
          else update({ last_interaction_from: from, last_interaction_to: to });
          setDateEditing(null);
        }}
      />
    </div>
  );
}
