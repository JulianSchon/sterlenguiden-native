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

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "app-theme-mode";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Det läge som faktiskt används just nu */
  scheme: "light" | "dark";
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        // Ett äldre sparat "system" ignoreras och blir förvalet mörkt
        if (stored === "light") setModeState(stored);
      })
      .catch(() => {});
  }, []);

  // Systemets egna delar (tangentbord, menyer) följer appens val i stället för telefonens
  useEffect(() => Appearance.setColorScheme(mode), [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
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
