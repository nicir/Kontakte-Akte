import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ContactQuery } from "@/lib/types";

export const EMPTY_QUERY: ContactQuery = {
  text: "",
  filters: [],
  first_met_from: null,
  first_met_to: null,
  last_interaction_from: null,
  last_interaction_to: null,
  has_open_reminder: null,
  sort: "name",
};

export function activeFilterCount(q: ContactQuery): number {
  return (
    q.filters.length +
    (q.first_met_from || q.first_met_to ? 1 : 0) +
    (q.last_interaction_from || q.last_interaction_to ? 1 : 0) +
    (q.has_open_reminder !== null ? 1 : 0)
  );
}

interface SearchState {
  query: ContactQuery;
  update: (patch: Partial<ContactQuery>) => void;
  reset: () => void;
}

const Ctx = createContext<SearchState | null>(null);

/** Keeps search text, filters and sorting while navigating between list and profiles. */
export function SearchStateProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState<ContactQuery>(EMPTY_QUERY);
  const update = useCallback((patch: Partial<ContactQuery>) => setQuery((q) => ({ ...q, ...patch })), []);
  const reset = useCallback(() => setQuery((q) => ({ ...EMPTY_QUERY, sort: q.sort })), []);
  const value = useMemo(() => ({ query, update, reset }), [query, update, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSearchState(): SearchState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("SearchStateProvider missing");
  return ctx;
}
