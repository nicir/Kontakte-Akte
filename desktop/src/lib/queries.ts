import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { get, post } from "./api";
import { localTimeZone } from "./format";
import type {
  BackupFile,
  ClassificationKind,
  ContactDetail,
  ContactQuery,
  ContactSearchResult,
  Country,
  CountryDetail,
  Dashboard,
  Interaction,
  ManagedClassification,
  MapData,
  MapDimension,
  RelationshipCategory,
  ReminderGroups,
  Settings,
  Suggestion,
} from "./types";

export const tz = () => localTimeZone();

export function useCountries() {
  return useQuery({ queryKey: ["countries"], queryFn: () => get<Country[]>("/api/countries"), staleTime: Infinity });
}

export function useContactSearch(query: ContactQuery) {
  return useQuery({
    queryKey: ["contacts", query],
    queryFn: () => post<ContactSearchResult>("/api/contacts/search", query),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: () => get<ContactDetail>(`/api/contacts/${id}`),
    enabled: !!id,
  });
}

export function useContactPhoto(id: string | undefined, version: string | null | undefined) {
  return useQuery({
    queryKey: ["photo", id, version],
    queryFn: async () => {
      const photo = await get<{ mime_type: string; image_base64: string }>(`/api/contacts/${id}/photo`);
      return `data:${photo.mime_type};base64,${photo.image_base64}`;
    },
    enabled: !!id && !!version,
    staleTime: Infinity,
  });
}

export function useInteractions(contactId?: string) {
  return useQuery({
    queryKey: ["interactions", contactId ?? "all"],
    queryFn: () => get<Interaction[]>("/api/interactions", { contact_id: contactId }),
  });
}

export function useReminders(contactId?: string) {
  return useQuery({
    queryKey: ["reminders", contactId ?? "all"],
    queryFn: () => get<ReminderGroups>("/api/reminders", { tz: tz(), contact_id: contactId }),
    refetchInterval: 60_000,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => get<Dashboard>("/api/dashboard", { tz: tz() }),
    refetchInterval: 60_000,
  });
}

export function useMapData(dimension: MapDimension) {
  return useQuery({
    queryKey: ["map", dimension],
    queryFn: () => get<MapData>("/api/map", { dimension }),
    placeholderData: keepPreviousData,
  });
}

export function useCountryDetail(dimension: MapDimension, code: string | null) {
  return useQuery({
    queryKey: ["map-country", dimension, code],
    queryFn: () => get<CountryDetail>(`/api/map/${code}`, { dimension }),
    enabled: !!code,
  });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => get<Settings>("/api/settings") });
}

export function useBackups() {
  return useQuery({ queryKey: ["backups"], queryFn: () => get<BackupFile[]>("/api/backups") });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => get<RelationshipCategory[]>("/api/relationship-categories"),
  });
}

export function useManagedClassifications(kind: ClassificationKind) {
  return useQuery({
    queryKey: ["classifications", kind],
    queryFn: () => get<ManagedClassification[]>("/api/classifications", { kind }),
  });
}

export function useSuggestions(kind: ClassificationKind, q: string, enabled = true) {
  return useQuery({
    queryKey: ["suggest", kind, q],
    queryFn: () => get<Suggestion[]>("/api/classifications/suggest", { kind, q, limit: 12 }),
    enabled,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useOrganizationSuggestions(q: string, enabled = true) {
  return useQuery({
    queryKey: ["orgs", q],
    queryFn: () => get<Suggestion[]>("/api/organizations/suggest", { q, limit: 12 }),
    enabled,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useLinkTypes() {
  return useQuery({ queryKey: ["link-types"], queryFn: () => get<string[]>("/api/link-types") });
}

/** After any write: refresh everything except static reference data. Local and cheap. */
export function useInvalidateAll() {
  const client = useQueryClient();
  return useCallback(() => {
    void client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "countries" });
    window.dispatchEvent(new Event("ka:data-changed"));
  }, [client]);
}
