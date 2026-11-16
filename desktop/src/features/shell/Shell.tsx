import { Bell, Globe2, LayoutDashboard, Lock, Settings as SettingsIcon, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "@/App";
import { BrainLogo } from "@/components/BrainLogo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ContactEditorPage } from "@/features/contacts/ContactEditor";
import { ContactProfilePage } from "@/features/contacts/ContactProfile";
import { ContactsPage } from "@/features/contacts/ContactsPage";
import { SearchStateProvider } from "@/features/contacts/searchState";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { WorldMapPage } from "@/features/map/WorldMapPage";
import { RemindersPage } from "@/features/reminders/RemindersPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { useAutoLock, useNotificationSync } from "@/hooks/useSessionGuards";
import { NavigationProvider, useNavigation, type Route } from "@/lib/navigation";
import { useReminders, useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

const NAV: { route: Route["name"]; label: string; icon: LucideIcon; matches: Route["name"][] }[] = [
  { route: "dashboard", label: "Dashboard", icon: LayoutDashboard, matches: ["dashboard"] },
  { route: "contacts", label: "Kontakte", icon: Users, matches: ["contacts", "contact", "contact-new", "contact-edit"] },
  { route: "map", label: "Weltkarte", icon: Globe2, matches: ["map"] },
  { route: "reminders", label: "Erinnerungen", icon: Bell, matches: ["reminders"] },
];

function Sidebar() {
  const { route, navigate } = useNavigation();
  const { lock } = useSession();
  const reminders = useReminders();
  const dueCount = (reminders.data?.overdue.length ?? 0) + (reminders.data?.today.length ?? 0);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Space for the macOS traffic lights (overlay title bar) + window drag area. */}
      <div data-tauri-drag-region className="h-10 shrink-0" />
      <div data-tauri-drag-region className="flex items-center gap-2.5 px-5 pb-6">
        <BrainLogo className="size-8 shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-semibold tracking-tight">Kontakte-Akte</div>
          <div className="truncate text-[11px] text-muted-foreground">Dein persönliches Netzwerk.</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Hauptnavigation">
        {NAV.map((item) => {
          const active = item.matches.includes(route.name);
          const Icon = item.icon;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => navigate({ name: item.route } as Route)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand-light text-brand-dark" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-brand")} aria-hidden="true" />
              {item.label}
              {item.route === "reminders" && dueCount > 0 && (
                <span className="ml-auto rounded-full bg-brand px-1.5 py-0.5 text-[10px] leading-none font-semibold text-white">
                  {dueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="flex items-center justify-between border-t border-border px-3 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate({ name: "settings" })}
              aria-label="Einstellungen"
              className={cn(
                "rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                route.name === "settings" && "bg-brand-light text-brand",
              )}
            >
              <SettingsIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Einstellungen</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void lock()}
              aria-label="Jetzt sperren"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Lock className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Jetzt sperren</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

function CurrentPage() {
  const { route } = useNavigation();
  switch (route.name) {
    case "dashboard":
      return <DashboardPage />;
    case "contacts":
      return <ContactsPage />;
    case "contact":
      return <ContactProfilePage id={route.id} />;
    case "contact-new":
      return <ContactEditorPage />;
    case "contact-edit":
      return <ContactEditorPage id={route.id} />;
    case "map":
      return <WorldMapPage />;
    case "reminders":
      return <RemindersPage />;
    case "settings":
      return <SettingsPage />;
  }
}

function Guards() {
  const { lock } = useSession();
  const settings = useSettings();
  useAutoLock(settings.data?.auto_lock_minutes, lock);
  useNotificationSync();
  return null;
}

export function Shell() {
  return (
    <NavigationProvider>
      <SearchStateProvider>
        <Guards />
        <div className="flex h-full">
          <Sidebar />
          <main className="relative flex-1 overflow-y-auto">
            <div data-tauri-drag-region className="sticky top-0 z-20 h-6 bg-background/0" />
            <div className="mx-auto max-w-6xl px-8 pb-12">
              <CurrentPage />
            </div>
          </main>
        </div>
      </SearchStateProvider>
    </NavigationProvider>
  );
}
