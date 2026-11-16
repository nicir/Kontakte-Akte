import { CalendarClock, Check, MoreHorizontal, Pencil, RotateCcw, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { del, errorMessage, post } from "@/lib/api";
import { formatDate, formatTime, localTimeZone, relativeDay } from "@/lib/format";
import { useNavigation } from "@/lib/navigation";
import { useInvalidateAll } from "@/lib/queries";
import type { Reminder } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ReminderDialog } from "./ReminderDialog";

const TONE: Record<Reminder["bucket"], string> = {
  overdue: "text-red-600",
  today: "text-brand",
  week: "text-foreground",
  later: "text-muted-foreground",
  done: "text-muted-foreground",
};

export function ReminderItem({ reminder, showContact = true }: { reminder: Reminder; showContact?: boolean }) {
  const { navigate } = useNavigation();
  const invalidate = useInvalidateAll();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const done = reminder.status === "done";
  const tz = localTimeZone();

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      invalidate();
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const postpone = (body: Record<string, unknown>) =>
    run(() => post(`/api/reminders/${reminder.id}/postpone`, { ...body, timezone: tz }), "Erinnerung verschoben.");

  return (
    <div className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-secondary/60">
      <button
        type="button"
        onClick={() =>
          run(
            () => post(`/api/reminders/${reminder.id}/${done ? "reopen" : "complete"}`, {}, { tz }),
            done ? "Erinnerung wieder geöffnet." : "Erledigt.",
          )
        }
        aria-label={done ? "Als offen markieren" : "Als erledigt markieren"}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 hover:border-brand",
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{reminder.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className={cn("inline-flex items-center gap-1", TONE[reminder.bucket])}>
            <CalendarClock className="size-3" aria-hidden="true" />
            {done && reminder.completed_at
              ? "erledigt"
              : `${formatDate(reminder.due_date)}${reminder.due_time ? `, ${formatTime(reminder.due_time)}` : ""} · ${relativeDay(reminder.due_date)}`}
          </span>
          {showContact && reminder.contact && (
            <button
              type="button"
              onClick={() => navigate({ name: "contact", id: reminder.contact!.id })}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand"
            >
              <User className="size-3" aria-hidden="true" />
              {reminder.contact.display_name}
            </button>
          )}
        </div>
        {reminder.description && <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground selectable">{reminder.description}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 opacity-60 group-hover:opacity-100" aria-label="Aktionen">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!done && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <RotateCcw className="size-4" /> Verschieben
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuItem onSelect={() => void postpone({ days: 1 })}>Um 1 Tag</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void postpone({ days: 7 })}>Um 1 Woche</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void postpone({ months: 1 })}>Um 1 Monat</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void postpone({ months: 3 })}>Um 3 Monate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="flex gap-1 p-1" onKeyDown={(e) => e.stopPropagation()}>
                  <Input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="h-8" aria-label="Neues Datum" />
                  <Button size="sm" className="h-8" disabled={!customDate} onClick={() => void postpone({ due_date: customDate })}>
                    OK
                  </Button>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-4" /> Bearbeiten
          </DropdownMenuItem>
          {reminder.contact && (
            <DropdownMenuItem onSelect={() => navigate({ name: "contact", id: reminder.contact!.id })}>
              <User className="size-4" /> Kontakt öffnen
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> Löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReminderDialog open={editing} onOpenChange={setEditing} reminder={reminder} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Erinnerung löschen?"
        description={`„${reminder.title}“ wird endgültig gelöscht.`}
        onConfirm={() => {
          setConfirmDelete(false);
          void run(() => del(`/api/reminders/${reminder.id}`), "Erinnerung gelöscht.");
        }}
      />
    </div>
  );
}
