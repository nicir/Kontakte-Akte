import { Plus, RotateCcw, Search, SearchX, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState, PageHeader, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import { SORT_LABELS } from "@/lib/labels";
import { useNavigation } from "@/lib/navigation";
import { useContactSearch } from "@/lib/queries";
import type { SortKey } from "@/lib/types";
import { ContactListItem } from "./ContactListItem";
import { FilterBar } from "./FilterBar";
import { activeFilterCount, useSearchState } from "./searchState";

export function ContactsPage() {
  const { navigate } = useNavigation();
  const { query, update, reset } = useSearchState();
  const [text, setText] = useState(query.text);
  const debounced = useDebounced(text, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounced !== query.text) update({ text: debounced });
  }, [debounced, query.text, update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate({ name: "contact-new" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const { data, isLoading, isFetching, error } = useContactSearch(query);
  const filtersActive = activeFilterCount(query) > 0 || !!query.text;

  return (
    <div>
      <PageHeader
        title="Kontakte"
        subtitle={data ? plural(data.total, "Kontakt", "Kontakte") + (filtersActive ? " gefunden" : "") : undefined}
        actions={
          <Button onClick={() => navigate({ name: "contact-new" })}>
            <Plus className="size-4" />
            Kontakt hinzufügen
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Suche nach Namen, Unternehmen, Expertise, Ländern, Themen, Notizen …"
          aria-label="Kontakte durchsuchen"
          className="h-12 w-full rounded-xl border border-border bg-card pr-12 pl-12 text-[15px] shadow-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:ring-[3px] focus:ring-ring/20"
        />
        {text && (
          <button
            type="button"
            onClick={() => setText("")}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Suchtext löschen"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar query={query} update={update} />
        </div>
        <div className="flex items-center gap-2">
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText("");
                reset();
              }}
            >
              <RotateCcw className="size-4" />
              Zurücksetzen
            </Button>
          )}
          <Select value={query.sort} onValueChange={(v) => update({ sort: v as SortKey })}>
            <SelectTrigger size="sm" className="w-48 bg-card" aria-label="Sortierung">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={`rounded-xl border border-border bg-card p-2 transition-opacity ${isFetching && !isLoading ? "opacity-70" : ""}`}>
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <EmptyState icon={SearchX} title="Suche fehlgeschlagen" description={errorMessage(error)} />
        ) : data && data.items.length > 0 ? (
          <ul className="divide-y divide-border/70">
            {data.items.map((c) => (
              <li key={c.id}>
                <ContactListItem contact={c} />
              </li>
            ))}
          </ul>
        ) : filtersActive ? (
          <EmptyState
            icon={SearchX}
            title="Keine passenden Kontakte"
            description="Passe den Suchtext oder die Filter an."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setText("");
                  reset();
                }}
              >
                Filter zurücksetzen
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Noch keine Kontakte"
            description="Lege deinen ersten Kontakt an – nur der Name ist erforderlich."
            action={
              <Button onClick={() => navigate({ name: "contact-new" })}>
                <Plus className="size-4" />
                Kontakt hinzufügen
              </Button>
            }
          />
        )}
        {data && data.total > data.items.length && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {data.items.length} von {data.total} angezeigt – grenze die Suche weiter ein.
          </p>
        )}
      </div>
    </div>
  );
}
