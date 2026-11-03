/**
 * Födelsedagen: är det ens födelsedag i dag (svensk tid), och har vykortet inte visats i år? Visas
 * en gång per år (telefonen minns det). Född 29 februari: vykortet kommer 28 februari de år som inte
 * har en 29:e.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { swedishDay } from "@/lib/streak";

const keyOf = (userId: string) => `birthday-card:v1:${userId}`;

function isBirthday(birthDate: string, today: string): boolean {
  const [year, month, day] = today.split("-").map(Number);
  const md = birthDate.slice(5, 10);
  if (md === today.slice(5, 10)) return true;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return md === "02-29" && !leap && month === 2 && day === 28;
}

export function useBirthday(userId: string | undefined, birthDate: string | null | undefined, enabled: boolean) {
  const [due, setDue] = useState(false);
  const year = swedishDay().slice(0, 4);

  useEffect(() => {
    if (!enabled || !userId || !birthDate || !isBirthday(birthDate, swedishDay())) {
      setDue(false);
      return;
    }
    let alive = true;
    AsyncStorage.getItem(keyOf(userId))
      .then((shown) => { if (alive) setDue(shown !== year); })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled, userId, birthDate, year]);

  const done = useCallback(() => {
    setDue(false);
    if (userId) AsyncStorage.setItem(keyOf(userId), year).catch(() => {});
  }, [userId, year]);

  return { due, done };
}
