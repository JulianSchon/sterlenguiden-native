/**
 * Tema: mörkt (förvalt) eller ljust. Valet sparas lokalt på enheten
 * (SecureStore, samma som inloggningen använder) så att det gäller redan innan
 * man loggat in. Sidor läser färger med useTheme() och bygger sina stilar med
 * useThemedStyles().
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";
import { darkColors, lightColors, type ThemeColors } from "./colors";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "app-theme-mode";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Det läge som faktiskt används just nu */
  scheme: "light" | "dark";
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Det sparade valet, inläst innan appen visas (loadSavedTheme) så att ljust läge inte blinkar mörkt vid start */
let savedMode: ThemeMode = "dark";
export async function loadSavedTheme(): Promise<void> {
  try {
    // Ett äldre sparat "system" ignoreras och blir förvalet mörkt
    if ((await SecureStore.getItemAsync(STORAGE_KEY)) === "light") savedMode = "light";
  } catch {
    // Inget sparat val: mörkt
  }
}

/**
 * `forced`: en del av appen som alltid har samma läge (t.ex. startsidan, som ligger över ett mörkt
 * foto). Den läser och ändrar inte det sparade valet och rör inte telefonens tangentbord och menyer.
 */
export function ThemeProvider({ children, forced }: { children: ReactNode; forced?: ThemeMode }) {
  return forced ? <ForcedTheme mode={forced}>{children}</ForcedTheme> : <AppTheme>{children}</AppTheme>;
}

function ForcedTheme({ mode, children }: { mode: ThemeMode; children: ReactNode }) {
  const value = useMemo<ThemeContextValue>(() => ({
    mode, setMode: () => {}, scheme: mode, colors: mode === "light" ? lightColors : darkColors,
  }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function AppTheme({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(savedMode);

  // Systemets egna delar (tangentbord, menyer) följer appens val i stället för telefonens
  useEffect(() => Appearance.setColorScheme(mode), [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    savedMode = next;
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    return { mode, setMode, scheme: mode, colors: mode === "light" ? lightColors : darkColors };
  }, [mode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme måste användas inom ThemeProvider");
  return ctx;
}

/**
 * Bygger en sidas stilar utifrån temat. Skriv stilarna som en funktion av
 * färgerna utanför komponenten och anropa useThemedStyles(createStyles):
 *
 *   const createStyles = (c: ThemeColors) => StyleSheet.create({ card: { backgroundColor: c.card } });
 *   const s = useThemedStyles(createStyles);
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(create: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => create(colors), [colors, create]);
}
