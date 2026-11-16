import { ChevronRight, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { relativeDay } from "@/lib/format";
import { useNavigation } from "@/lib/navigation";
import type { ContactSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function contactSubtitle(c: ContactSummary): string {
  const role = c.professions[0] ?? c.job_title;
  return [role, c.company].filter(Boolean).join(" · ");
}

export function ContactListItem({
  contact,
  compact = false,
  aside,
}: {
  contact: ContactSummary;
  compact?: boolean;
  aside?: ReactNode;
}) {
  const { navigate } = useNavigation();
  const subtitle = contactSubtitle(contact);
  const residence = [contact.city, contact.residence?.name].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      onClick={() => navigate({ name: "contact", id: contact.id })}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70",
        compact ? "px-2 py-2" : "px-3 py-3",
      )}
    >
      <Avatar initials={contact.initials} src={contact.thumbnail} size={compact ? "sm" : "md"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium text-foreground">{contact.display_name}</span>
          {!compact && subtitle && <span className="truncate text-sm text-muted-foreground">{subtitle}</span>}
        </div>
        {compact ? (
          subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {residence && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {residence}
              </span>
            )}
            {contact.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full bg-brand-light px-2 py-0.5 font-medium text-brand-dark">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {aside ??
        (!compact && (
          <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
            <div>Letzter Kontakt</div>
            <div className="font-medium text-foreground">{relativeDay(contact.last_interaction_date)}</div>
          </div>
        ))}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
