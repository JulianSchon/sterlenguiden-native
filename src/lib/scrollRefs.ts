/**
 * scrollRefs – globalt register för ScrollView-refs per tab.
 * Används av FloatingNav för att scrolla till toppen när aktiv tab trycks.
 *
 * Stöder antingen en ScrollView-ref ELLER en callback-funktion.
 */
import { RefObject } from "react";
import { ScrollView } from "react-native";

type TabId = "home" | "search" | "calendar" | "profile";

const refs      = new Map<TabId, RefObject<ScrollView>>();
const callbacks = new Map<TabId, () => void>();

/** Registrera en ScrollView-ref för en tab. */
export function registerScroll(tab: TabId, ref: RefObject<ScrollView>) {
  refs.set(tab, ref);
  callbacks.delete(tab);
}

/** Registrera en scroll-to-top-callback för en tab (när ScrollView är inuti en sub-komponent). */
export function registerScrollCallback(tab: TabId, fn: () => void) {
  callbacks.set(tab, fn);
  refs.delete(tab);
}

/** Scrolla till toppen för given tab. */
export function scrollToTop(tab: TabId) {
  const cb = callbacks.get(tab);
  if (cb) { cb(); return; }
  refs.get(tab)?.current?.scrollTo({ y: 0, animated: true });
}
