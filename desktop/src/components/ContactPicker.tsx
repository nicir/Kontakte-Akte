import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounced } from "@/hooks/useDebounced";
import { useContactSearch } from "@/lib/queries";
import type { ContactRef } from "@/lib/types";
import { cn } from "@/lib/utils";

function ContactSearchList({
  selectedIds,
  excludeIds = [],
  onSelect,
}: {
  selectedIds: string[];
  excludeIds?: string[];
  onSelect: (contact: ContactRef) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 200);
  const { data, isFetching } = useContactSearch({
    text: debounced,
    filters: [],
    first_met_from: null,
    first_met_to: null,
    last_interaction_from: null,
    last_interaction_to: null,
    has_open_reminder: null,
    sort: "name",
    limit: 30,
  });
  const items = (data?.items ?? []).filter((c) => !excludeIds.includes(c.id));
  return (
    <Command shouldFilter={false}>
      <CommandInput placeholder="Kontakt suchen …" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-64">
        <CommandEmpty>{isFetching ? "Suche …" : "Kein Kontakt gefunden."}</CommandEmpty>
        {items.map((c) => (
          <CommandItem
            key={c.id}
            value={c.id}
            onSelect={() => onSelect({ id: c.id, display_name: c.display_name, initials: c.initials, has_photo: !!c.thumbnail })}
          >
            <Check className={cn("size-4", selectedIds.includes(c.id) ? "opacity-100 text-brand" : "opacity-0")} />
            <Avatar initials={c.initials} src={c.thumbnail} size="sm" className="size-6 text-[10px]" />
            <span className="truncate">{c.display_name}</span>
            {c.company && <span className="ml-auto truncate text-xs text-muted-foreground">{c.company}</span>}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function ContactMultiPicker({
  values,
  onChange,
  label = "Kontakte",
}: {
  values: ContactRef[];
  onChange: (values: ContactRef[]) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (contact: ContactRef) =>
    onChange(values.some((v) => v.id === contact.id) ? values.filter((v) => v.id !== contact.id) : [...values, contact]);
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5">
      {values.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-2.5 text-xs font-medium">
          {c.display_name}
          <button
            type="button"
            onClick={() => toggle(c)}
            className="rounded-full p-0.5 hover:bg-gray-200"
            aria-label={`${c.display_name} entfernen`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs">
            + {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <ContactSearchList selectedIds={values.map((v) => v.id)} onSelect={toggle} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ContactSinglePicker({
  value,
  onChange,
  excludeIds,
  placeholder = "Kontakt wählen",
  id,
}: {
  value: ContactRef | null;
  onChange: (value: ContactRef | null) => void;
  excludeIds?: string[];
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className="h-9 flex-1 justify-between font-normal" role="combobox" aria-expanded={open}>
            <span className={cn("truncate", !value && "text-muted-foreground/70")}>{value ? value.display_name : placeholder}</span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <ContactSearchList
            selectedIds={value ? [value.id] : []}
            excludeIds={excludeIds}
            onSelect={(c) => {
              onChange(c.id === value?.id ? null : c);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => onChange(null)} aria-label="Auswahl entfernen">
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
