import {
  ArrowLeft,
  Bell,
  Briefcase,
  CalendarPlus,
  Camera,
  Globe,
  Handshake,
  Link2,

  Mail,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Phone,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/Avatar";
import { ContactSinglePicker } from "@/components/ContactPicker";
import { Card, CardTitle, Chip, ConfirmDialog, EmptyState, ErrorNote, Field, Spinner } from "@/components/common";
import { SuggestInput } from "@/components/TagInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { InteractionDialog } from "@/features/activity/InteractionDialog";
import { InteractionTimeline } from "@/features/activity/InteractionTimeline";
import { ReminderDialog } from "@/features/activity/ReminderDialog";
import { ReminderItem } from "@/features/activity/ReminderItem";
import { del, errorMessage, post, put } from "@/lib/api";
import { formatDate, relativeDay } from "@/lib/format";
import { prepareProfilePhoto } from "@/lib/image";
import { CHANNEL_LABELS, CLASSIFICATION_LABELS } from "@/lib/labels";
import { useNavigation } from "@/lib/navigation";
import { useContact, useContactPhoto, useInteractions, useInvalidateAll, useLinkTypes, useReminders } from "@/lib/queries";
import type { ChannelKind, ClassificationKind, ContactDetail, ContactLink, ContactRef } from "@/lib/types";

const CHANNEL_ICONS: Record<ChannelKind, typeof Mail> = {
  email: Mail,
  phone: Phone,
  whatsapp: MessageCircle,
  linkedin: Briefcase,
  website: Globe,
  other: Link2,
};

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words selectable">{children}</dd>
    </div>
  );
}

function ChipList({ values, tone = "neutral" }: { values: string[]; tone?: "neutral" | "brand" }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <Chip key={v} tone={tone}>
          {v}
        </Chip>
      ))}
    </div>
  );
}

function PhotoControl({ contact }: { contact: ContactDetail }) {
  const input = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateAll();
  const photo = useContactPhoto(contact.id, contact.photo_version);
  const upload = async (file: File) => {
    try {
      const prepared = await prepareProfilePhoto(file);
      await put(`/api/contacts/${contact.id}/photo`, prepared);
      invalidate();
      toast.success("Profilbild gespeichert.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="group relative rounded-full" aria-label="Profilbild ändern">
            <Avatar initials={contact.initials} src={photo.data} size="xl" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
              <Camera className="size-5" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => input.current?.click()}>Bild auswählen …</DropdownMenuItem>
          {contact.has_photo && (
            <DropdownMenuItem
              className="text-red-600"
              onSelect={async () => {
                try {
                  await del(`/api/contacts/${contact.id}/photo`);
                  invalidate();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              Bild entfernen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function LinkDialog({
  open,
  onOpenChange,
  contact,
  link,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contact: ContactDetail;
  link?: ContactLink | null;
}) {
  const invalidate = useInvalidateAll();
  const linkTypes = useLinkTypes();
  const [target, setTarget] = useState<ContactRef | null>(null);
  const [relation, setRelation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTarget(link?.other ?? null);
      setRelation(link?.relation_type ?? "");
      setDescription(link?.description ?? "");
      setError(null);
    }
  }
  const save = async () => {
    if (!link && !target) return setError("Bitte wähle einen Kontakt aus.");
    if (!relation.trim()) return setError("Bitte beschreibe die Art der Verbindung.");
    try {
      if (link) await put(`/api/links/${link.id}`, { relation_type: relation.trim(), description: description.trim() || null });
      else
        await post(`/api/contacts/${contact.id}/links`, {
          target_contact_id: target!.id,
          relation_type: relation.trim(),
          description: description.trim() || null,
        });
      invalidate();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{link ? "Verknüpfung bearbeiten" : "Kontakt verknüpfen"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {!link && (
            <Field label="Verknüpfter Kontakt">
              <ContactSinglePicker value={target} onChange={setTarget} excludeIds={[contact.id]} />
            </Field>
          )}
          <Field label={`Beziehung (aus Sicht von ${contact.display_name})`} htmlFor="l-rel">
            <SuggestInput id="l-rel" value={relation} onChange={setRelation} source={{ options: linkTypes.data ?? [] }} placeholder="z. B. hat mich vorgestellt, arbeitet mit" />
          </Field>
          <Field label="Beschreibung (optional)" htmlFor="l-desc">
            <Textarea id="l-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error && <ErrorNote message={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit">Speichern</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotesCard({ contact }: { contact: ContactDetail }) {
  const invalidate = useInvalidateAll();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(contact.personal_notes ?? "");
  const save = async () => {
    try {
      await put(`/api/contacts/${contact.id}/notes`, { personal_notes: value.trim() || null });
      invalidate();
      setEditing(false);
      toast.success("Notizen gespeichert.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Card>
      <CardTitle
        icon={NotebookPen}
        action={
          !editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setValue(contact.personal_notes ?? "");
                setEditing(true);
              }}
            >
              <Pencil className="size-3.5" /> Bearbeiten
            </Button>
          )
        }
      >
        Notizen
      </CardTitle>
      {editing ? (
        <div className="space-y-2">
          <Textarea autoFocus rows={6} value={value} onChange={(e) => setValue(e.target.value)} aria-label="Notizen" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={() => void save()}>
              Speichern
            </Button>
          </div>
        </div>
      ) : contact.personal_notes ? (
        <p className="text-sm whitespace-pre-line selectable">{contact.personal_notes}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Noch keine Notizen.</p>
      )}
    </Card>
  );
}

export function ContactProfilePage({ id }: { id: string }) {
  const { navigate, back } = useNavigation();
  const invalidate = useInvalidateAll();
  const { data: contact, isLoading, error } = useContact(id);
  const interactions = useInteractions(id);
  const reminders = useReminders(id);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editLink, setEditLink] = useState<ContactLink | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading) return <Spinner />;
  if (error || !contact) return <ErrorNote message={error ? errorMessage(error) : "Kontakt nicht gefunden."} />;

  const ref: ContactRef = { id: contact.id, display_name: contact.display_name, initials: contact.initials, has_photo: contact.has_photo };
  const cls = contact.classifications;
  const role = [cls.profession.join(", "), contact.job_title].filter(Boolean).join(" · ");
  const residence = [contact.city, contact.countries.residence.map((c) => c.name).join(", ")].filter(Boolean).join(", ");
  const headlineTags = [...cls.specialization, ...cls.expertise].slice(0, 6);
  const openReminders = reminders.data ? [...reminders.data.overdue, ...reminders.data.today, ...reminders.data.week, ...reminders.data.later] : [];
  const doneReminders = reminders.data?.done ?? [];

  const remove = async () => {
    setDeleting(true);
    try {
      await del(`/api/contacts/${contact.id}`);
      invalidate();
      toast.success("Kontakt gelöscht.");
      navigate({ name: "contacts" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const expertiseKinds: ClassificationKind[] = ["industry", "specialization", "expertise", "responsibility", "topic", "interest", "shared_interest", "collaboration", "project", "tag", "language"];

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={back}>
        <ArrowLeft className="size-4" /> Zurück
      </Button>

      {/* Header */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start gap-5">
          <PhotoControl contact={contact} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight selectable">{contact.display_name}</h1>
            {(role || contact.current_organization) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/80">
                <Briefcase className="size-4 text-muted-foreground" aria-hidden="true" />
                {[role, contact.current_organization].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {residence && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" aria-hidden="true" /> {residence}
                </span>
              )}
              {contact.countries.nationality.length > 0 && (
                <span>Nationalität: {contact.countries.nationality.map((c) => c.name).join(", ")}</span>
              )}
              <span>Letzter Kontakt: {relativeDay(contact.last_interaction_date)}</span>
            </div>
            {headlineTags.length > 0 && (
              <div className="mt-3">
                <ChipList values={headlineTags} tone="brand" />
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setInteractionOpen(true)}>
              <MessageSquarePlus className="size-4" /> Interaktion
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReminderOpen(true)}>
              <CalendarPlus className="size-4" /> Erinnerung
            </Button>
            <Button size="sm" onClick={() => navigate({ name: "contact-edit", id: contact.id })}>
              <Pencil className="size-4" /> Bearbeiten
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Weitere Aktionen">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                  <Users className="size-4" /> Kontakt verknüpfen
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> Kontakt löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardTitle
              icon={Bell}
              action={
                <Button variant="ghost" size="sm" onClick={() => setReminderOpen(true)}>
                  + Erinnerung
                </Button>
              }
            >
              Follow-ups
            </CardTitle>
            {openReminders.length === 0 && doneReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Erinnerungen.</p>
            ) : (
              <div className="-mx-2">
                {openReminders.map((r) => (
                  <ReminderItem key={r.id} reminder={r} showContact={false} />
                ))}
                {doneReminders.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer px-2 py-1 text-xs text-muted-foreground">Erledigt ({doneReminders.length})</summary>
                    {doneReminders.map((r) => (
                      <ReminderItem key={r.id} reminder={r} showContact={false} />
                    ))}
                  </details>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle
              icon={MessageSquarePlus}
              action={
                <Button variant="ghost" size="sm" onClick={() => setInteractionOpen(true)}>
                  + Interaktion
                </Button>
              }
            >
              Interaktionsverlauf
            </CardTitle>
            {interactions.isLoading ? (
              <Spinner />
            ) : interactions.data && interactions.data.length > 0 ? (
              <InteractionTimeline interactions={interactions.data} currentContactId={contact.id} />
            ) : (
              <EmptyState
                compact
                icon={MessageSquarePlus}
                title="Noch keine Interaktionen"
                description="Dokumentiere Treffen, Telefonate oder Nachrichten."
              />
            )}
          </Card>

          <NotesCard key={contact.updated_at} contact={contact} />
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <Card>
            <CardTitle icon={Mail}>Kontaktdaten</CardTitle>
            {contact.channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Kontaktdaten hinterlegt.</p>
            ) : (
              <ul className="space-y-2">
                {contact.channels.map((ch) => {
                  const Icon = CHANNEL_ICONS[ch.kind];
                  return (
                    <li key={ch.id} className="flex items-start gap-2.5 text-sm">
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="break-all selectable">{ch.value}</div>
                        <div className="text-xs text-muted-foreground">
                          {CHANNEL_LABELS[ch.kind]}
                          {ch.label ? ` · ${ch.label}` : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle icon={Handshake}>Beziehung</CardTitle>
            <dl>
              <DetailRow label="Kategorie">{contact.relationship_category?.name}</DetailRow>
              <DetailRow label="Woher bekannt">{contact.how_known}</DetailRow>
              <DetailRow label="Kennengelernt">
                {[contact.first_met_place, contact.first_met_date ? formatDate(contact.first_met_date) : null].filter(Boolean).join(", ")}
              </DetailRow>
              <DetailRow label="Vorgestellt durch">
                {contact.introduced_by ? (
                  <button type="button" className="text-brand hover:underline" onClick={() => navigate({ name: "contact", id: contact.introduced_by!.id })}>
                    {contact.introduced_by.display_name}
                  </button>
                ) : (
                  contact.introduced_by_text
                )}
              </DetailRow>
              <DetailRow label="Stärke">{contact.relationship_strength ? `${contact.relationship_strength} / 5` : null}</DetailRow>
              <DetailRow label="Nächstes Treffen">{contact.next_planned_interaction ? formatDate(contact.next_planned_interaction) : null}</DetailRow>
              <DetailRow label="Notizen">{contact.relationship_notes && <span className="whitespace-pre-line">{contact.relationship_notes}</span>}</DetailRow>
            </dl>
            {!contact.relationship_category && !contact.how_known && !contact.first_met_place && !contact.first_met_date && !contact.introduced_by && !contact.introduced_by_text && (
              <p className="text-sm text-muted-foreground">Keine Angaben.</p>
            )}
          </Card>

          <Card>
            <CardTitle icon={Sparkles}>Expertise & Länder</CardTitle>
            <dl>
              <DetailRow label="Beruf">{cls.profession.join(", ")}</DetailRow>
              {contact.previous_organizations.length > 0 && (
                <DetailRow label="Frühere Unternehmen">{contact.previous_organizations.join(", ")}</DetailRow>
              )}
              <DetailRow label="Tätigkeitsländer">{contact.countries.activity.map((c) => c.name).join(", ")}</DetailRow>
              <DetailRow label="Expertise-Länder">{contact.countries.expertise.map((c) => c.name).join(", ")}</DetailRow>
              <DetailRow label="Interessensländer">{contact.countries.interest.map((c) => c.name).join(", ")}</DetailRow>
              {expertiseKinds.map((kind) =>
                cls[kind].length ? (
                  <DetailRow key={kind} label={CLASSIFICATION_LABELS[kind]}>
                    <ChipList values={cls[kind]} tone={kind === "specialization" || kind === "expertise" ? "brand" : "neutral"} />
                  </DetailRow>
                ) : null,
              )}
            </dl>
          </Card>

          <Card>
            <CardTitle
              icon={Users}
              action={
                <Button variant="ghost" size="sm" onClick={() => setLinkOpen(true)}>
                  + Verknüpfen
                </Button>
              }
            >
              Verknüpfte Kontakte
            </CardTitle>
            {contact.links.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine verknüpften Kontakte.</p>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {contact.links.map((link) => (
                  <li key={link.id} className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-secondary/60">
                    <button type="button" className="flex min-w-0 flex-1 items-start gap-2.5 text-left" onClick={() => navigate({ name: "contact", id: link.other.id })}>
                      <Avatar initials={link.other.initials} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{link.other.display_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {link.direction === "outgoing"
                            ? `${contact.display_name} → ${link.relation_type}`
                            : `${link.relation_type} (laut ${link.other.display_name})`}
                        </div>
                        {link.description && <div className="mt-0.5 text-xs text-muted-foreground">{link.description}</div>}
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Verknüpfung bearbeiten">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditLink(link)}>Bearbeiten</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onSelect={async () => {
                            try {
                              await del(`/api/links/${link.id}`);
                              invalidate();
                            } catch (err) {
                              toast.error(errorMessage(err));
                            }
                          }}
                        >
                          Verknüpfung entfernen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <InteractionDialog open={interactionOpen} onOpenChange={setInteractionOpen} initialParticipants={[ref]} />
      <ReminderDialog open={reminderOpen} onOpenChange={setReminderOpen} contact={ref} />
      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} contact={contact} />
      <LinkDialog open={!!editLink} onOpenChange={(o) => !o && setEditLink(null)} contact={contact} link={editLink} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`${contact.display_name} löschen?`}
        busy={deleting}
        description={
          <>
            Der Kontakt, seine Erinnerungen, Verknüpfungen und Interaktionen, an denen nur diese Person beteiligt war, werden
            endgültig gelöscht. Gemeinsame Interaktionen, Unternehmen und Kategorien bleiben erhalten.
          </>
        }
        onConfirm={() => void remove()}
      />
    </div>
  );
}
