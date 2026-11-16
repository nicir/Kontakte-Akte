import type {
  BackupFile,
  ChannelKind,
  ClassificationKind,
  CountryKind,
  FilterField,
  InteractionKind,
  MapDimension,
  ReminderBucket,
  SortKey,
} from "./types";

export const COUNTRY_KIND_LABELS: Record<CountryKind, string> = {
  nationality: "Nationalität",
  residence: "Wohnsitz",
  activity: "Tätigkeitsländer",
  expertise: "Expertise-Länder",
  interest: "Interessensländer",
};

export const CLASSIFICATION_LABELS: Record<ClassificationKind, string> = {
  profession: "Beruf",
  specialization: "Spezialisierungen",
  industry: "Branchen",
  expertise: "Expertise",
  responsibility: "Verantwortungsbereiche",
  topic: "Besprochene Themen",
  interest: "Interessen",
  shared_interest: "Gemeinsame Interessen",
  collaboration: "Kooperationsthemen",
  project: "Projektideen",
  tag: "Tags",
  language: "Sprachen",
};

export const CLASSIFICATION_PLACEHOLDERS: Partial<Record<ClassificationKind, string>> = {
  profession: "z. B. Rechtsanwalt",
  specialization: "z. B. Indisches Steuerrecht",
  industry: "z. B. Finanzdienstleistungen",
  expertise: "z. B. Cross-border M&A",
  responsibility: "z. B. Steuerstrukturierung",
  topic: "z. B. Markteintritt Indien",
  interest: "z. B. Private Equity",
  shared_interest: "z. B. Cricket",
  collaboration: "z. B. Investitionsprojekt Indien–Europa",
  project: "z. B. Infrastrukturfonds",
  tag: "z. B. Mentor",
  language: "z. B. Englisch",
};

export const CHANNEL_LABELS: Record<ChannelKind, string> = {
  email: "E-Mail",
  phone: "Telefon",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  website: "Website",
  other: "Sonstiges",
};

export const CHANNEL_LABEL_PRESETS = ["Arbeit", "Privat", "Mobil", "Sonstiges"];

export const INTERACTION_LABELS: Record<InteractionKind, string> = {
  meeting: "Treffen",
  phone: "Telefonat",
  email: "E-Mail",
  video: "Videocall",
  conference: "Konferenz-Begegnung",
  conversation: "Persönliches Gespräch",
  introduction: "Vorstellung",
  message: "Nachricht",
  other: "Sonstiges",
};

export const BUCKET_LABELS: Record<ReminderBucket, string> = {
  overdue: "Überfällig",
  today: "Heute",
  week: "Nächste 7 Tage",
  later: "Später",
  done: "Erledigt",
};

export const MAP_DIMENSION_LABELS: Record<MapDimension, string> = {
  residence: "Wohnsitz",
  nationality: "Nationalität",
  activity: "Tätigkeitsland",
  expertise: "Expertise-Land",
  interest: "Interessensland",
};

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  created: "Zuletzt hinzugefügt",
  updated: "Zuletzt bearbeitet",
  last_interaction: "Zuletzt kontaktiert",
};

export type FilterFieldKind = "country" | "classification" | "organization" | "category";

export interface FilterFieldDef {
  field: FilterField;
  label: string;
  kind: FilterFieldKind;
  group: "Länder" | "Beruf & Expertise" | "Themen & Interessen" | "Beziehung";
}

export const FILTER_FIELDS: FilterFieldDef[] = [
  { field: "nationality", label: "Nationalität", kind: "country", group: "Länder" },
  { field: "residence", label: "Wohnsitzland", kind: "country", group: "Länder" },
  { field: "activity", label: "Tätigkeitsland", kind: "country", group: "Länder" },
  { field: "expertise_country", label: "Expertise-Land", kind: "country", group: "Länder" },
  { field: "interest_country", label: "Interessensland", kind: "country", group: "Länder" },
  { field: "profession", label: "Beruf", kind: "classification", group: "Beruf & Expertise" },
  { field: "specialization", label: "Spezialisierung", kind: "classification", group: "Beruf & Expertise" },
  { field: "industry", label: "Branche", kind: "classification", group: "Beruf & Expertise" },
  { field: "expertise", label: "Expertise", kind: "classification", group: "Beruf & Expertise" },
  { field: "responsibility", label: "Verantwortungsbereich", kind: "classification", group: "Beruf & Expertise" },
  { field: "organization", label: "Unternehmen", kind: "organization", group: "Beruf & Expertise" },
  { field: "language", label: "Sprache", kind: "classification", group: "Beruf & Expertise" },
  { field: "topic", label: "Besprochenes Thema", kind: "classification", group: "Themen & Interessen" },
  { field: "interest", label: "Interesse", kind: "classification", group: "Themen & Interessen" },
  { field: "shared_interest", label: "Gemeinsames Interesse", kind: "classification", group: "Themen & Interessen" },
  { field: "collaboration", label: "Kooperationsthema", kind: "classification", group: "Themen & Interessen" },
  { field: "project", label: "Projektidee", kind: "classification", group: "Themen & Interessen" },
  { field: "tag", label: "Tag", kind: "classification", group: "Themen & Interessen" },
  { field: "relationship_category", label: "Beziehungskategorie", kind: "category", group: "Beziehung" },
];

export function filterFieldDef(field: FilterField): FilterFieldDef {
  return FILTER_FIELDS.find((f) => f.field === field) ?? FILTER_FIELDS[0]!;
}

export const BACKUP_KIND_LABELS: Record<BackupFile["kind"], string> = {
  manual: "Manuelle Sicherung",
  "pre-migration": "Vor Update",
  "pre-restore": "Vor Wiederherstellung",
  import: "Importiert",
  other: "Sicherung",
};
