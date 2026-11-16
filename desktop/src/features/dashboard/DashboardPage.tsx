import { AlarmClock, Bell, Clock3, Globe2, Hourglass, Plus, UserPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardTitle, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ReminderItem } from "@/features/activity/ReminderItem";
import { ContactListItem } from "@/features/contacts/ContactListItem";
import { errorMessage } from "@/lib/api";
import { relativeDay } from "@/lib/format";
import { useNavigation } from "@/lib/navigation";
import { useDashboard } from "@/lib/queries";
import { cn } from "@/lib/utils";

function Metric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "neutral" | "warn";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-orange-200"
    >
      <div className={cn("flex size-10 items-center justify-center rounded-lg", tone === "warn" && value > 0 ? "bg-red-50" : "bg-brand-light")}>
        <Icon className={cn("size-5", tone === "warn" && value > 0 ? "text-red-600" : "text-brand")} aria-hidden="true" />
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString("de-DE")}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </button>
  );
}

export function DashboardPage() {
  const { navigate } = useNavigation();
  const { data, isLoading, error } = useDashboard();

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorNote message={errorMessage(error)} />;

  if (data.total_contacts === 0)
    return (
      <div>
        <PageHeader title="Dashboard" />
        <Card>
          <EmptyState
            icon={Users}
            title="Willkommen bei Kontakte-Akte"
            description="Lege deinen ersten Kontakt an. Alle Daten bleiben verschlüsselt auf diesem Mac."
            action={
              <Button onClick={() => navigate({ name: "contact-new" })}>
                <Plus className="size-4" /> Kontakt hinzufügen
              </Button>
            }
          />
        </Card>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Dein Netzwerk auf einen Blick."
        actions={
          <Button onClick={() => navigate({ name: "contact-new" })}>
            <Plus className="size-4" /> Kontakt hinzufügen
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric icon={Users} label="Kontakte" value={data.total_contacts} onClick={() => navigate({ name: "contacts" })} />
        <Metric icon={Globe2} label="Länder vertreten" value={data.countries_represented} onClick={() => navigate({ name: "map" })} />
        <Metric icon={Bell} label="Anstehende Erinnerungen" value={data.upcoming_reminders} onClick={() => navigate({ name: "reminders" })} />
        <Metric icon={AlarmClock} label="Überfällig" value={data.overdue_reminders} tone="warn" onClick={() => navigate({ name: "reminders" })} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle icon={Bell} action={<Button variant="ghost" size="sm" onClick={() => navigate({ name: "reminders" })}>Alle</Button>}>
            Anstehende Follow-ups
          </CardTitle>
          {data.upcoming_followups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine offenen Erinnerungen.</p>
          ) : (
            <div className="-mx-2">
              {data.upcoming_followups.map((r) => (
                <ReminderItem key={r.id} reminder={r} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle icon={Hourglass}>Kontakte ohne Interaktion seit {data.inactivity_days} Tagen</CardTitle>
          {data.inactive_contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Du bist mit allen in Kontakt geblieben.</p>
          ) : (
            <>
              <ul className="-mx-2">
                {data.inactive_contacts.map((i) => (
                  <li key={i.contact.id}>
                    <ContactListItem
                      contact={i.contact}
                      compact
                      aside={
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {i.contact.last_interaction_date ? relativeDay(i.contact.last_interaction_date) : "noch keine Interaktion"}
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
              {data.inactive_total > data.inactive_contacts.length && (
                <p className="mt-2 text-xs text-muted-foreground">und {data.inactive_total - data.inactive_contacts.length} weitere</p>
              )}
            </>
          )}
        </Card>

        <Card>
          <CardTitle icon={Clock3}>Zuletzt kontaktiert</CardTitle>
          {data.recently_contacted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Interaktionen dokumentiert.</p>
          ) : (
            <ul className="-mx-2">
              {data.recently_contacted.map((c) => (
                <li key={c.id}>
                  <ContactListItem
                    contact={c}
                    compact
                    aside={<span className="shrink-0 text-xs text-muted-foreground">{relativeDay(c.last_interaction_date)}</span>}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle icon={UserPlus}>Zuletzt hinzugefügt</CardTitle>
          <ul className="-mx-2">
            {data.recently_added.map((c) => (
              <li key={c.id}>
                <ContactListItem contact={c} compact aside={<span />} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
