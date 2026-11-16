// Types mirroring the backend Pydantic schemas (backend/app/schemas).

export type CountryKind = "nationality" | "residence" | "activity" | "expertise" | "interest";
export type ClassificationKind =
  | "profession"
  | "specialization"
  | "industry"
  | "expertise"
  | "responsibility"
  | "topic"
  | "interest"
  | "shared_interest"
  | "collaboration"
  | "project"
  | "tag"
  | "language";
export type ChannelKind = "email" | "phone" | "whatsapp" | "linkedin" | "website" | "other";
export type InteractionKind =
  | "meeting"
  | "phone"
  | "email"
  | "video"
  | "conference"
  | "conversation"
  | "introduction"
  | "message"
  | "other";
export type ReminderBucket = "overdue" | "today" | "week" | "later" | "done";
export type MapDimension = "residence" | "nationality" | "activity" | "expertise" | "interest";

export interface ContactRef {
  id: string;
  display_name: string;
  initials: string;
  has_photo: boolean;
}

export interface CountryRef {
  code: string;
  name: string;
}

export interface Country {
  code: string;
  numeric: string | null;
  name: string;
}

export interface Channel {
  id?: number;
  kind: ChannelKind;
  label: string | null;
  value: string;
}

export interface ContactLink {
  id: string;
  direction: "outgoing" | "incoming";
  other: ContactRef;
  relation_type: string;
  description: string | null;
  created_at: string;
}

export interface ContactDetail {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  initials: string;
  city: string | null;
  job_title: string | null;
  personal_notes: string | null;
  how_known: string | null;
  first_met_place: string | null;
  first_met_date: string | null;
  introduced_by: ContactRef | null;
  introduced_by_text: string | null;
  relationship_category: { id: number; name: string } | null;
  relationship_strength: number | null;
  relationship_notes: string | null;
  next_planned_interaction: string | null;
  current_organization: string | null;
  previous_organizations: string[];
  countries: Record<CountryKind, CountryRef[]>;
  classifications: Record<ClassificationKind, string[]>;
  channels: Channel[];
  has_photo: boolean;
  photo_version: string | null;
  last_interaction_date: string | null;
  links: ContactLink[];
  created_at: string;
  updated_at: string;
}

export interface ContactInput {
  first_name: string;
  last_name: string;
  display_name: string;
  city: string | null;
  job_title: string | null;
  personal_notes: string | null;
  how_known: string | null;
  first_met_place: string | null;
  first_met_date: string | null;
  introduced_by_id: string | null;
  introduced_by_text: string | null;
  relationship_category_id: number | null;
  relationship_strength: number | null;
  relationship_notes: string | null;
  next_planned_interaction: string | null;
  current_organization: string | null;
  previous_organizations: string[];
  countries: Record<CountryKind, string[]>;
  classifications: Record<ClassificationKind, string[]>;
  channels: { kind: ChannelKind; label: string | null; value: string }[];
}

export interface ContactSummary {
  id: string;
  display_name: string;
  initials: string;
  thumbnail: string | null;
  professions: string[];
  job_title: string | null;
  company: string | null;
  city: string | null;
  residence: CountryRef | null;
  tags: string[];
  last_interaction_date: string | null;
  created_at: string;
  updated_at: string;
}

export type FilterField =
  | "nationality"
  | "residence"
  | "activity"
  | "expertise_country"
  | "interest_country"
  | ClassificationKind
  | "organization"
  | "relationship_category";

export interface FilterCondition {
  field: FilterField;
  values: string[];
  match: "any" | "all";
}

export type SortKey = "name" | "created" | "updated" | "last_interaction";

export interface ContactQuery {
  text: string;
  filters: FilterCondition[];
  first_met_from: string | null;
  first_met_to: string | null;
  last_interaction_from: string | null;
  last_interaction_to: string | null;
  has_open_reminder: boolean | null;
  sort: SortKey;
  limit?: number;
  offset?: number;
}

export interface ContactSearchResult {
  total: number;
  items: ContactSummary[];
}

export interface Suggestion {
  id: number;
  name: string;
  usage: number;
}

export interface ManagedClassification {
  id: number;
  kind: ClassificationKind;
  name: string;
  contact_count: number;
  interaction_count: number;
  aliases: { id: number; alias: string }[];
}

export interface RelationshipCategory {
  id: number;
  name: string;
  contact_count: number;
}

export interface Interaction {
  id: string;
  occurred_on: string;
  occurred_time: string | null;
  kind: InteractionKind;
  title: string;
  description: string | null;
  location: string | null;
  participants: ContactRef[];
  topics: string[];
  reminders: { id: string; title: string; due_date: string; status: string }[];
  created_at: string;
  updated_at: string;
}

export interface FollowUpInput {
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  timezone: string;
  contact_id: string | null;
}

export interface InteractionInput {
  occurred_on: string;
  occurred_time: string | null;
  kind: InteractionKind;
  title: string;
  description: string | null;
  location: string | null;
  participant_ids: string[];
  topics: string[];
  follow_up: FollowUpInput | null;
}

export interface Reminder {
  id: string;
  contact: ContactRef | null;
  interaction_id: string | null;
  interaction_title: string | null;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  timezone: string;
  due_at: string;
  status: "open" | "done";
  bucket: ReminderBucket;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderInput {
  contact_id: string | null;
  interaction_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  timezone: string;
}

export type ReminderGroups = Record<ReminderBucket, Reminder[]>;

export interface NotificationPlan {
  overdue_count: number;
  today_count: number;
  upcoming: { id: string; title: string; contact_name: string | null; due_at_ms: number }[];
}

export interface InactiveContact {
  contact: ContactSummary;
  reference_date: string | null;
  days: number | null;
}

export interface Dashboard {
  total_contacts: number;
  countries_represented: number;
  upcoming_reminders: number;
  overdue_reminders: number;
  inactivity_days: number;
  recently_added: ContactSummary[];
  recently_contacted: ContactSummary[];
  upcoming_followups: Reminder[];
  inactive_contacts: InactiveContact[];
  inactive_total: number;
}

export interface CountryCount {
  code: string;
  numeric: string | null;
  name: string;
  count: number;
}

export interface MapData {
  dimension: MapDimension;
  countries: CountryCount[];
  max_count: number;
  contacts_with_country: number;
}

export interface CountryDetail {
  code: string;
  name: string;
  dimension: MapDimension;
  count: number;
  contacts: ContactSummary[];
  professions: { name: string; count: number }[];
  companies: { name: string; count: number }[];
  expertise: { name: string; count: number }[];
}

export interface Settings {
  auto_lock_minutes: number;
  notifications_enabled: boolean;
  notification_show_details: boolean;
  inactivity_days: number;
}

export interface BackupFile {
  location: "backups" | "import";
  file_name: string;
  kind: "manual" | "pre-migration" | "pre-restore" | "import" | "other";
  size_bytes: number;
  modified_at: string;
}

export interface BackupVerify {
  ok: boolean;
  contacts: number;
  interactions: number;
  reminders: number;
  schema_revision: string | null;
  compatible: boolean;
  size_bytes: number;
}

export interface AuthStatus {
  initialized: boolean;
  unlocked: boolean;
  authenticated: boolean;
}
