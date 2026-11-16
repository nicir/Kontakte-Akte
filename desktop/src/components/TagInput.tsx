import { Plus, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useDebounced } from "@/hooks/useDebounced";
import { useOrganizationSuggestions, useSuggestions } from "@/lib/queries";
import { cleanValue, fold, uniqueByFold } from "@/lib/text";
import type { ClassificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

type Source = { kind: ClassificationKind } | { organizations: true } | { options: string[] };

function useOptions(source: Source, query: string, active: boolean): string[] {
  const debounced = useDebounced(query, 150);
  const classification = useSuggestions(
    "kind" in source ? source.kind : "tag",
    debounced,
    active && "kind" in source,
  );
  const orgs = useOrganizationSuggestions(debounced, active && "organizations" in source);
  if ("kind" in source) return (classification.data ?? []).map((s) => s.name);
  if ("organizations" in source) return (orgs.data ?? []).map((s) => s.name);
  const q = fold(query);
  return source.options.filter((o) => !q || fold(o).includes(q));
}

interface Suggestable {
  open: boolean;
  options: string[];
  highlighted: number;
  setHighlighted: (n: number) => void;
}

function SuggestionList({
  state,
  listId,
  onPick,
  createLabel,
  freeTextLabel = (v) => `„${v}“ neu anlegen`,
}: {
  state: Suggestable;
  listId: string;
  onPick: (value: string) => void;
  createLabel: string | null;
  freeTextLabel?: (value: string) => string;
}) {
  if (!state.open || (state.options.length === 0 && !createLabel)) return null;
  return (
    <ul
      id={listId}
      role="listbox"
      className="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      {state.options.map((option, index) => (
        <li
          key={option}
          role="option"
          aria-selected={index === state.highlighted}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(option);
          }}
          onMouseEnter={() => state.setHighlighted(index)}
          className={cn(
            "cursor-pointer rounded-md px-2 py-1.5 text-sm",
            index === state.highlighted ? "bg-accent text-accent-foreground" : "text-foreground",
          )}
        >
          {option}
        </li>
      ))}
      {createLabel && (
        <li
          role="option"
          aria-selected={state.highlighted === state.options.length}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(createLabel);
          }}
          onMouseEnter={() => state.setHighlighted(state.options.length)}
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
            state.highlighted === state.options.length ? "bg-accent text-accent-foreground" : "text-muted-foreground",
          )}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {freeTextLabel(createLabel)}
        </li>
      )}
    </ul>
  );
}

/** Multi-value input with deterministic autocomplete from existing database values. */
export function TagInput({
  id,
  values,
  onChange,
  placeholder,
  source,
  ariaLabel,
  freeTextLabel,
}: {
  id?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  source: Source;
  ariaLabel?: string;
  /** Label of the "use what I typed" option (default: „…“ neu anlegen). */
  freeTextLabel?: (value: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  // The list closes after a value was added (so it never covers buttons below)
  // and reopens on typing, ArrowDown or clicking into the field.
  const [listOpen, setListOpen] = useState(false);
  // -1 = nothing chosen with the arrow keys: Enter then uses exactly what was typed.
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const raw = useOptions(source, query, focused);
  const selectedKeys = useMemo(() => new Set(values.map(fold)), [values]);
  const options = raw.filter((o) => !selectedKeys.has(fold(o))).slice(0, 10);
  const typed = cleanValue(query);
  const createLabel = typed && !raw.some((o) => fold(o) === fold(typed)) && !selectedKeys.has(fold(typed)) ? typed : null;

  const add = (value: string) => {
    const next = uniqueByFold([...values, value]);
    onChange(next);
    setQuery("");
    setHighlighted(-1);
    setListOpen(false);
  };
  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const total = options.length + (createLabel ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!listOpen) return setListOpen(true);
      setHighlighted((h) => (total ? (h + 1) % total : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (total ? (h <= 0 ? total - 1 : h - 1) : -1));
    } else if (e.key === "Enter") {
      if (!typed && (options.length === 0 || !listOpen)) return;
      e.preventDefault();
      // Exact (case/diacritic-insensitive) match → reuse the existing spelling.
      const exact = raw.find((o) => fold(o) === fold(typed));
      const pick = highlighted >= 0 ? (options[highlighted] ?? createLabel) : (exact ?? typed);
      if (pick) add(pick);
    } else if (e.key === "," || e.key === ";") {
      e.preventDefault();
      if (typed) add(typed);
    } else if (e.key === "Tab" && typed) {
      add(raw.find((o) => fold(o) === fold(typed)) ?? typed);
    } else if (e.key === "Backspace" && !query && values.length) {
      remove(values[values.length - 1]!);
    } else if (e.key === "Escape" && listOpen) {
      e.preventDefault();
      e.stopPropagation();
      setListOpen(false);
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1.5 transition-colors",
          focused && "border-ring ring-[3px] ring-ring/20",
        )}
        onClick={() => {
          inputRef.current?.focus();
          setListOpen(true);
        }}
      >
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full bg-brand-light py-0.5 pr-1 pl-2.5 text-xs font-medium text-brand-dark"
          >
            {value}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(value);
              }}
              className="rounded-full p-0.5 hover:bg-orange-200/60"
              aria-label={`${value} entfernen`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(-1);
            setListOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setListOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setListOpen(false);
            if (typed) add(typed);
          }}
          onKeyDown={onKeyDown}
          placeholder={values.length ? "" : placeholder}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={focused && listOpen}
          role="combobox"
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      <SuggestionList
        state={{ open: focused && listOpen, options, highlighted, setHighlighted }}
        listId={listId}
        onPick={add}
        createLabel={createLabel}
        freeTextLabel={freeTextLabel}
      />
    </div>
  );
}

/** Single text value with suggestions (e.g. company, relation type). Free text is always allowed. */
export function SuggestInput({
  id,
  value,
  onChange,
  placeholder,
  source,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  source: Source;
}) {
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const listId = useId();
  const options = useOptions(source, value, focused)
    .filter((o) => fold(o) !== fold(value))
    .slice(0, 8);

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlighted(-1);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, -1));
          } else if (e.key === "Enter" && highlighted >= 0 && options[highlighted]) {
            e.preventDefault();
            onChange(options[highlighted]!);
            setFocused(false);
          } else if (e.key === "Escape") {
            setFocused(false);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={focused && options.length > 0}
        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:ring-[3px] focus:ring-ring/20"
      />
      <SuggestionList
        state={{ open: focused, options, highlighted, setHighlighted }}
        listId={listId}
        onPick={(v) => {
          onChange(v);
          setFocused(false);
        }}
        createLabel={null}
      />
    </div>
  );
}
