import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCountries } from "@/lib/queries";
import { fold } from "@/lib/text";
import { cn } from "@/lib/utils";

function CountryList({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (code: string) => void;
}) {
  const { data: countries = [] } = useCountries();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = fold(query);
    if (!q) return countries;
    return countries.filter((c) => fold(c.name).includes(q) || c.code.toLowerCase() === q);
  }, [countries, query]);
  return (
    <Command shouldFilter={false}>
      <CommandInput placeholder="Land suchen …" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-64">
        <CommandEmpty>Kein Land gefunden.</CommandEmpty>
        {filtered.map((country) => (
          <CommandItem key={country.code} value={country.code} onSelect={() => onToggle(country.code)}>
            <Check className={cn("size-4", selected.includes(country.code) ? "opacity-100 text-brand" : "opacity-0")} />
            {country.name}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function useCountryName() {
  const { data: countries = [] } = useCountries();
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c.name])), [countries]);
  return (code: string) => byCode.get(code) ?? code;
}

/** Searchable multi-select of countries (ISO 3166-1 alpha-2, German names). */
export function CountryMultiSelect({
  values,
  onChange,
  label,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const name = useCountryName();
  const toggle = (code: string) =>
    onChange(values.includes(code) ? values.filter((v) => v !== code) : [...values, code]);
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5">
      {values.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1 rounded-full bg-brand-light py-0.5 pr-1 pl-2.5 text-xs font-medium text-brand-dark"
        >
          {name(code)}
          <button
            type="button"
            onClick={() => toggle(code)}
            className="rounded-full p-0.5 hover:bg-orange-200/60"
            aria-label={`${name(code)} entfernen`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" aria-label={`${label}: Land hinzufügen`}>
            <Plus className="size-3.5" />
            Land
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <CountryList selected={values} onToggle={toggle} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Single country (e.g. residence). */
export function CountrySingleSelect({
  value,
  onChange,
  id,
  placeholder = "Land wählen",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const name = useCountryName();
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className="h-9 flex-1 justify-between font-normal" role="combobox" aria-expanded={open}>
            <span className={cn("truncate", !value && "text-muted-foreground/70")}>{value ? name(value) : placeholder}</span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <CountryList
            selected={value ? [value] : []}
            onToggle={(code) => {
              onChange(code === value ? null : code);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="ghost" size="icon" className="size-9" onClick={() => onChange(null)} aria-label="Land entfernen">
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
