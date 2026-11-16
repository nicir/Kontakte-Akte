import { BellOff, Plus } from "lucide-react";
import { useState } from "react";
import { Card, EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ReminderDialog } from "@/features/activity/ReminderDialog";
import { ReminderItem } from "@/features/activity/ReminderItem";
import { errorMessage } from "@/lib/api";
import { BUCKET_LABELS } from "@/lib/labels";
import { useReminders } from "@/lib/queries";
import type { ReminderBucket } from "@/lib/types";
import { cn } from "@/lib/utils";

const ORDER: ReminderBucket[] = ["overdue", "today", "week", "later"];

export function RemindersPage() {
  const { data, isLoading, error } = useReminders();
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const openCount = data ? ORDER.reduce((n, b) => n + data[b].length, 0) : 0;

  return (
    <div>
      <PageHeader
        title="Erinnerungen"
        subtitle={data ? `${openCount} offen` : undefined}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Erinnerung anlegen
          </Button>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : error || !data ? (
        <ErrorNote message={errorMessage(error)} />
      ) : openCount === 0 && data.done.length === 0 ? (
        <Card>
          <EmptyState
            icon={BellOff}
            title="Keine Erinnerungen"
            description="Lege Follow-ups an, um niemanden aus den Augen zu verlieren."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {ORDER.map((bucket) => (
            <Card key={bucket} className={cn(data[bucket].length === 0 && "opacity-70")}>
              <h2 className={cn("mb-2 flex items-center gap-2 text-sm font-semibold", bucket === "overdue" && data.overdue.length > 0 && "text-red-600")}>
                {BUCKET_LABELS[bucket]}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{data[bucket].length}</span>
              </h2>
              {data[bucket].length === 0 ? (
                <p className="text-sm text-muted-foreground">Nichts.</p>
              ) : (
                <div className="-mx-2">
                  {data[bucket].map((r) => (
                    <ReminderItem key={r.id} reminder={r} />
                  ))}
                </div>
              )}
            </Card>
          ))}
          <Card>
            <button type="button" className="flex w-full items-center gap-2 text-sm font-semibold" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
              {BUCKET_LABELS.done}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{data.done.length}</span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">{showDone ? "Ausblenden" : "Anzeigen"}</span>
            </button>
            {showDone && (
              <div className="-mx-2 mt-2">
                {data.done.map((r) => (
                  <ReminderItem key={r.id} reminder={r} />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
      <ReminderDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
