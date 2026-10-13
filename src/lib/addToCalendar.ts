/**
 * "Lägg till i kalender": öppnar telefonens egen ruta för en ny kalenderhändelse (Apple Kalender på
 * iPhone, Googles kalenderapp på Android) med titel, tid, plats och beskrivning ifyllt — man
 * trycker bara Lägg till.
 *
 * Det kräver modulen expo-calendar i själva appbygget. I ett bygge utan den (före nästa EAS-bygge)
 * öppnas Google Kalender på webben som reserv, så knappen alltid gör något.
 */
import { Linking, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { addHours, format, parseISO } from "date-fns";
import type { Event } from "@/hooks/useEvents";

/** "19:00" eller "19:00–22:30" → start och (om den står) sluttid */
function parseTimes(time: string | null | undefined): { start: [number, number]; end: [number, number] | null } | null {
  const m = time?.match(/(\d{1,2})[:.](\d{2})(?:\s*[–-]\s*(\d{1,2})[:.](\d{2}))?/);
  if (!m) return null;
  return {
    start: [Number(m[1]), Number(m[2])],
    end: m[3] ? [Number(m[3]), Number(m[4])] : null,
  };
}

function eventTimes(e: Event): { start: Date; end: Date; allDay: boolean } | null {
  if (!e.date) return null;
  const day = parseISO(e.date);
  const lastDay = e.end_date && e.end_date > e.date ? parseISO(e.end_date) : day;
  const t = parseTimes(e.time);
  if (!t) {
    // Ingen tid: heldag(ar)
    const end = new Date(lastDay);
    end.setDate(end.getDate() + 1);
    return { start: day, end, allDay: true };
  }
  const start = new Date(day);
  start.setHours(t.start[0], t.start[1], 0, 0);
  let end: Date;
  if (t.end) {
    end = new Date(lastDay);
    end.setHours(t.end[0], t.end[1], 0, 0);
    if (end <= start) end = addHours(start, 2);
  } else {
    // Ingen sluttid: två timmar (sista dagen, för ett event som pågår flera dagar)
    end = new Date(lastDay);
    end.setHours(t.start[0] + 2, t.start[1], 0, 0);
  }
  return { start, end, allDay: false };
}

export async function addEventToCalendar(e: Event, place: string | null) {
  const times = eventTimes(e);
  if (!times) return;
  const location = [place, "Österlen"].filter(Boolean).join(", ");

  if (Platform.OS !== "web" && requireOptionalNativeModule("ExpoCalendar")) {
    // Laddas först här: modulen kastar ett fel redan när den importeras om den saknas i bygget
    const Calendar = require("expo-calendar") as typeof import("expo-calendar");
    await Calendar.createEventInCalendarAsync({
      title: e.title,
      startDate: times.start,
      endDate: times.end,
      allDay: times.allDay,
      location,
      notes: e.description ?? undefined,
      url: e.ticket_url ?? e.website_url ?? undefined,
    });
    return;
  }

  const fmt = (d: Date) => (times.allDay ? format(d, "yyyyMMdd") : format(d, "yyyyMMdd'T'HHmmss"));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${fmt(times.start)}/${fmt(times.end)}`,
    details: e.description ?? "",
    location,
    ctz: "Europe/Stockholm",
  });
  await Linking.openURL(`https://calendar.google.com/calendar/render?${params}`);
}
