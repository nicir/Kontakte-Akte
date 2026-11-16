import {
  Calendar,
  Handshake,
  Mail,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Phone,
  Presentation,
  Sparkles,
  UserPlus,
  Video,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { del, errorMessage } from "@/lib/api";
import { formatDate, formatTime } from "@/lib/format";
import { INTERACTION_LABELS } from "@/lib/labels";
import { useNavigation } from "@/lib/navigation";
import { useInvalidateAll } from "@/lib/queries";
import type { Interaction, InteractionKind } from "@/lib/types";
import { InteractionDialog } from "./InteractionDialog";

const ICONS: Record<InteractionKind, typeof Phone> = {
  meeting: Handshake,
  phone: Phone,
  email: Mail,
  video: Video,
  conference: Presentation,
  conversation: MessagesSquare,
  introduction: UserPlus,
  message: MessageCircle,
  other: Sparkles,
};

export function InteractionTimeline({ interactions, currentContactId }: { interactions: Interaction[]; currentContactId?: string }) {
  const { navigate } = useNavigation();
  const invalidate = useInvalidateAll();
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [deleting, setDeleting] = useState<Interaction | null>(null);

  return (
    <>
      <ol className="relative space-y-5 border-l border-border pl-6">
        {interactions.map((i) => {
          const Icon = ICONS[i.kind];
          const others = i.participants.filter((p) => p.id !== currentContactId);
          return (
            <li key={i.id} className="group relative">
              <span className="absolute top-0.5 -left-[2.15rem] flex size-7 items-center justify-center rounded-full border border-orange-200 bg-brand-light">
                <Icon className="size-3.5 text-brand" aria-hidden="true" />
              </span>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{i.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="size-3" aria-hidden="true" />
                      {formatDate(i.occurred_on)}
                      {i.occurred_time ? `, ${formatTime(i.occurred_time)}` : ""}
                    </span>
                    <span>· {INTERACTION_LABELS[i.kind]}</span>
                    {i.location && <span>· {i.location}</span>}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Interaktion bearbeiten">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(i)}>Bearbeiten</DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onSelect={() => setDeleting(i)}>
                      Löschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {i.description && <p className="mt-1.5 text-sm whitespace-pre-line text-foreground/90 selectable">{i.description}</p>}
              {(i.topics.length > 0 || others.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {i.topics.map((t) => (
                    <span key={t} className="rounded-full bg-brand-light px-2 py-0.5 font-medium text-brand-dark">
                      {t}
                    </span>
                  ))}
                  {others.length > 0 && (
                    <span className="text-muted-foreground">
                      mit{" "}
                      {others.map((p, idx) => (
                        <span key={p.id}>
                          {idx > 0 && ", "}
                          <button type="button" className="text-foreground hover:text-brand hover:underline" onClick={() => navigate({ name: "contact", id: p.id })}>
                            {p.display_name}
                          </button>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              )}
              {i.reminders.length > 0 && (
                <div className="mt-1.5 text-xs text-muted-foreground">
                  Follow-up: {i.reminders.map((r) => `${r.title} (${formatDate(r.due_date)}${r.status === "done" ? ", erledigt" : ""})`).join("; ")}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <InteractionDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} initialParticipants={[]} interaction={editing} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Interaktion löschen?"
        description={deleting ? `„${deleting.title}“ wird für alle beteiligten Kontakte gelöscht.` : ""}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await del(`/api/interactions/${deleting.id}`);
            invalidate();
            toast.success("Interaktion gelöscht.");
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setDeleting(null);
          }
        }}
      />
    </>
  );
}
