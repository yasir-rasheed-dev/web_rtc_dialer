import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme as useRNColorScheme } from "react-native";
import { colorScheme as nwColorScheme } from "nativewind";
import * as SecureStore from "expo-secure-store";

type ThemePref = "light" | "dark" | "system";
type Ctx = {
  pref: ThemePref;
  resolved: "light" | "dark";
  setPref: (p: ThemePref) => void;
  toggle: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);
const KEY = "ringnex.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useRNColorScheme() ?? "light";
  const [pref, setPrefState] = useState<ThemePref>("system");

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setPrefState(v);
      })
      .catch(() => {});
  }, []);

  const resolved: "light" | "dark" = pref === "system" ? (system as "light" | "dark") : pref;

  useEffect(() => {
    // Drive NativeWind (adds/removes the `dark` class used by tailwind + global.css)
    nwColorScheme.set(pref === "system" ? "system" : pref);
  }, [pref]);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    SecureStore.setItemAsync(KEY, p).catch(() => {});
  };

  const value = useMemo<Ctx>(
    () => ({
      pref,
      resolved,
      setPref,
      toggle: () => setPref(resolved === "dark" ? "light" : "dark")
    }),
    [pref, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
