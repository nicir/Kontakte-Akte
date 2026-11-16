import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Route =
  | { name: "dashboard" }
  | { name: "contacts" }
  | { name: "contact"; id: string }
  | { name: "contact-new" }
  | { name: "contact-edit"; id: string }
  | { name: "map" }
  | { name: "reminders" }
  | { name: "settings" };

interface Navigation {
  route: Route;
  navigate: (route: Route) => void;
  /** Replace the current entry (e.g. editor → profile after saving). */
  replace: (route: Route) => void;
  back: () => void;
  canGoBack: boolean;
}

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: "dashboard" }]);

  const navigate = useCallback((route: Route) => {
    setStack((s) => {
      const top = s[s.length - 1];
      if (top && JSON.stringify(top) === JSON.stringify(route)) return s;
      const isTopLevel = ["dashboard", "contacts", "map", "reminders", "settings"].includes(route.name);
      return isTopLevel ? [route] : [...s.slice(-20), route];
    });
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, []);

  const replace = useCallback((route: Route) => {
    setStack((s) => [...s.slice(0, -1), route]);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: "contacts" }]));
  }, []);

  const value = useMemo<Navigation>(
    () => ({ route: stack[stack.length - 1]!, navigate, replace, back, canGoBack: stack.length > 1 }),
    [stack, navigate, replace, back],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("NavigationProvider missing");
  return ctx;
}
