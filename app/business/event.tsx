/**
 * Nytt evenemang — eller ändra/kopiera ett. Ett steg i taget:
 *   1. Vad heter det?          5. Berätta mer (text och sorts evenemang, båda krävs)
 *   2. När? (dag och tid)      6. Bra att veta (inomhus, mat, parkering, barn, hund, rullstol,
 *   3. Återkommer det?            biljetter, annan plats)
 *   4. Bild                    7. Så här ser det ut — tryck på kortet för att se hela panelen; Publicera
 * Återkommande tillfällen hänger ihop (samma serie), så man kan ändra eller ta bort alla kommande
 * på en gång. Utan egen bild får evenemanget platsens första bild.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import {
  Accessibility, Baby, CalendarCheck, CalendarDays, CalendarRange, Car, Dog, Home, Repeat, Ticket, UtensilsCrossed,
} from "lucide-react-native";
import { AuthButton, FieldNote } from "@/components/auth/AuthParts";
import { StepLayout } from "@/components/onboarding/StepLayout";
import { DateBox } from "@/components/events/EventCards";
import { IconSwitch } from "@/components/IconSwitch";
import { Chip, ChoiceCard, Note, PortalField, PortalToast, type PortalToastHandle } from "@/components/business/PortalParts";
import { DateCalendar, TimeWheel, dayText, todayIso } from "@/components/business/Pickers";
import { useScreenEntered, useWizard, WizardFrame } from "@/components/business/Wizard";
import { DoneMoment, ImageChooser } from "@/components/business/WizardParts";
import { useBusinessPlace, useEventActions, usePlaceEvents, usePortalPlace, type EventDraft } from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, cleanUrl } from "@/lib/business";
import { EVENT_CATEGORIES, eventWhen } from "@/lib/events";
import { openEvent } from "@/lib/eventSheet";
import type { Event } from "@/hooks/useEvents";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";
import { currentLanguage } from "@/i18n";

type Step = "title" | "when" | "repeat" | "image" | "about" | "details" | "review" | "done";
const NEW: Step[] = ["title", "when", "repeat", "image", "about", "details", "review", "done"];
const EDIT: Step[] = ["title", "when", "image", "about", "details", "review", "done"];

const SUGGESTIONS = ["Livemusik", "Quiz", "Vinprovning", "Öppet hus", "Marknad", "Yoga", "Guidad tur"];

type Repeat = "none" | "weekly" | "biweekly" | "monthly" | "custom";
type Entry = "free" | "tickets" | "booking";

interface Draft {
  title: string;
  date: string | null;
  end: string | null;
  multiDay: boolean;
  start: string | null;
  stop: string | null;
  editing: "start" | "stop";
  repeat: Repeat;
  count: number;
  custom: string[];
  image: string | null;
  description: string;
  category: string | null;
  indoor: boolean;
  food: boolean;
  parking: boolean;
  child: boolean;
  dog: boolean;
  access: boolean;
  entry: Entry;
  link: string;
  otherPlace: boolean;
  location: string;
}

/** Datumen för en serie: varje vecka, varannan vecka eller samma dag varje månad */
function seriesDates(first: string, repeat: Repeat, count: number, custom: string[]): string[] {
  if (repeat === "custom") return [...new Set([first, ...custom])].sort();
  if (repeat === "none") return [first];
  const out: string[] = [];
  const d = new Date(`${first}T12:00:00`);
  for (let i = 0; i < count; i++) {
    const x = new Date(d);
    if (repeat === "weekly") x.setDate(d.getDate() + 7 * i);
    if (repeat === "biweekly") x.setDate(d.getDate() + 14 * i);
    if (repeat === "monthly") {
      // Den 31:a blir sista dagen i kortare månader (inte den 1:a i nästa)
      const last = new Date(d.getFullYear(), d.getMonth() + i + 1, 0).getDate();
      x.setDate(1);
      x.setMonth(d.getMonth() + i);
      x.setDate(Math.min(d.getDate(), last));
    }
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

const splitTime = (time: string | null | undefined): [string | null, string | null] => {
  const m = time?.match(/(\d{1,2}[:.]\d{2})(?:\s*[-–]\s*(\d{1,2}[:.]\d{2}))?/);
  const norm = (v?: string) => (v ? v.replace(".", ":").padStart(5, "0") : null);
  return m ? [norm(m[1]), norm(m[2])] : [null, null];
};

export default function EventComposer() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ id?: string; copy?: string }>();
  const { placeId, mine } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const { data: events } = usePlaceEvents(placeId);
  const actions = useEventActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const editingId = params.id ? Number(params.id) : null;
  const wizard = useWizard(editingId ? EDIT : NEW);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const entered = useScreenEntered();
  const titleRef = useRef<TextInput>(null);
  // Första fältet får fokus när sidan glidit in klart (då följer knappen tangentbordet mjukt)
  useEffect(() => {
    if (entered && wizard.step === "title" && draft && !editingId) titleRef.current?.focus();
  }, [entered, wizard.step, !!draft, editingId]);
  const images = useMemo(() => placeImages(place?.image_url), [place?.image_url]);
  const source = events?.find((e) => String(e.id) === (params.id ?? params.copy));

  useEffect(() => {
    if (draft || !place) return;
    if ((params.id || params.copy) && !events) return;
    const e = source;
    const [start, stop] = splitTime(e?.time);
    const copy = !!params.copy;
    setDraft({
      title: e?.title ?? "",
      date: e && !copy ? e.date : null,
      end: e && !copy ? e.end_date ?? null : null,
      multiDay: !!(e?.end_date && e.date && e.end_date > e.date),
      start, stop, editing: "start",
      repeat: "none", count: 4, custom: [],
      image: e?.image_url ?? images[0] ?? null,
      description: e?.description ?? "",
      category: e?.main_category ?? null,
      indoor: !!e?.is_indoor, food: !!e?.has_food_drink, parking: !!e?.has_parking,
      child: !!e?.is_child_friendly, dog: !!e?.is_dog_friendly, access: !!e?.is_accessible,
      entry: e?.tickets_required ? "tickets" : e?.booking_required ? "booking" : "free",
      link: e?.ticket_url ?? "",
      otherPlace: !!e?.location, location: e?.location ?? "",
    });
  }, [draft, place, events, source, params.id, params.copy, images]);

  if (!draft || !place || !mine) {
    return <WizardFrame stepKey="loading" progress={0} forward onBack={() => router.back()}><View /></WizardFrame>;
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const leave = () => {
    if (editingId || !draft.title.trim() || wizard.step === "done") { router.back(); return; }
    Alert.alert(tb("Sluta skapa evenemanget?"), tb("Det du fyllt i sparas inte."), [
      { text: tb("Fortsätt skriva"), style: "cancel" },
      { text: tb("Sluta"), style: "destructive", onPress: () => router.back() },
    ]);
  };

  const time = draft.start ? (draft.stop ? `${draft.start}–${draft.stop}` : draft.start) : null;
  const link = cleanUrl(draft.link);
  const payload: EventDraft = {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    date: draft.date ?? todayIso(),
    end_date: draft.multiDay && draft.end && draft.date && draft.end > draft.date ? draft.end : null,
    time,
    location: draft.otherPlace ? draft.location.trim() || null : null,
    image_url: draft.image,
    main_category: draft.category,
    tickets_required: draft.entry === "tickets",
    booking_required: draft.entry === "booking",
    ticket_url: draft.entry !== "free" && link ? link : null,
    is_indoor: draft.indoor,
    has_food_drink: draft.food,
    has_parking: draft.parking,
    is_child_friendly: draft.child,
    is_dog_friendly: draft.dog,
    is_accessible: draft.access,
  };
  const dates = draft.date ? seriesDates(draft.date, draft.repeat, draft.count, draft.custom) : [];

  const publish = async (scope: "one" | "series" = "one") => {
    setBusy(true);
    setError(null);
    try {
      if (editingId) await actions.save(payload, { id: editingId, scope });
      else await actions.save(payload, { dates: dates.slice(1) });
      wizard.next();
    } catch (e) {
      setError(businessError(e));
    } finally {
      setBusy(false);
    }
  };
  const onPublish = () => {
    if (editingId && source?.series_id) {
      Alert.alert(tb("Ändra vilka?"), tb("Evenemanget återkommer. Vill du ändra bara det här tillfället eller alla kommande?"), [
        { text: tb("Avbryt"), style: "cancel" },
        { text: tb("Bara det här"), onPress: () => publish("one") },
        { text: tb("Alla kommande"), onPress: () => publish("series") },
      ]);
    } else {
      publish();
    }
  };

  const next = <AuthButton label={tb("Fortsätt")} onPress={wizard.next} />;
  let content: React.ReactNode = null;
  switch (wizard.step) {
    case "title":
      content = (
        <StepLayout title={tb("Vad heter evenemanget?")} subtitle={tb("Kort och lockande – det är det som syns i kalendern.")} scroll
          footer={<AuthButton label={tb("Fortsätt")} onPress={wizard.next} disabled={draft.title.trim().length < 2} />}>
          <PortalField ref={titleRef} label={tb("Namn")} big value={draft.title} maxLength={70} placeholder={tb("T.ex. Allsångsquiz med Bradders")}
            onChangeText={(v) => set({ title: v })} returnKeyType="next" onSubmitEditing={() => draft.title.trim().length >= 2 && wizard.next()} />
          <View style={s.chips}>
            {SUGGESTIONS.map((t) => <Chip key={t} label={tb(t)} selected={draft.title === tb(t)} onPress={() => set({ title: tb(t) })} />)}
          </View>
        </StepLayout>
      );
      break;
    case "when":
      content = (
        <StepLayout title={tb("När är det?")} scroll
          footer={<AuthButton label={tb("Fortsätt")} onPress={wizard.next} disabled={!draft.date || (draft.multiDay && !draft.end)} />}>
          <View style={s.card}>
            <DateCalendar
              value={draft.multiDay ? { mode: "range", from: draft.date, to: draft.end } : { mode: "single", date: draft.date }}
              onChange={(v) => {
                if (v.mode === "single") set({ date: v.date });
                if (v.mode === "range") set({ date: v.from, end: v.to });
              }}
            />
          </View>
          <View style={s.toggleRow}>
            <Text style={s.toggleText}>{tb("Pågår flera dagar i rad")}</Text>
            <IconSwitch value={draft.multiDay} onChange={(v) => set({ multiDay: v, end: null })} />
          </View>
          {draft.date && <Text style={[s.picked, { color: colors.goldText }]}>{draft.multiDay && draft.end ? `${dayText(draft.date)} – ${dayText(draft.end)}` : dayText(draft.date)}</Text>}
          <View style={s.toggleRow}>
            <Text style={s.toggleText}>{tb("Börjar en viss tid")}</Text>
            <IconSwitch value={!!draft.start} onChange={(v) => set({ start: v ? "18:00" : null, stop: null, editing: "start" })} />
          </View>
          {draft.start && (
            <View style={s.card}>
              <View style={s.timeRow}>
                <Chip label={tb("Börjar {{0}}", { 0: draft.start })} selected={draft.editing === "start"} onPress={() => set({ editing: "start" })} />
                {draft.stop
                  ? <Chip label={tb("Slutar {{0}}", { 0: draft.stop })} selected={draft.editing === "stop"} onPress={() => set({ editing: "stop" })} />
                  : <Chip label={tb("+ Sluttid")} selected={false} onPress={() => set({ stop: "21:00", editing: "stop" })} />}
              </View>
              <TimeWheel
                value={draft.editing === "stop" && draft.stop ? draft.stop : draft.start}
                onChange={(v) => set(draft.editing === "stop" ? { stop: v } : { start: v })}
              />
            </View>
          )}
        </StepLayout>
      );
      break;
    case "repeat":
      content = (
        <StepLayout title={tb("Återkommer det?")} subtitle={tb("Lägg in alla tillfällen på en gång – de hänger ihop, så ni kan ändra alla samtidigt.")} scroll
          footer={<AuthButton label={dates.length > 1 ? tb("Fortsätt med {{0}} tillfällen", { 0: dates.length }) : tb("Fortsätt")} onPress={wizard.next} />}>
          <ChoiceCard icon={CalendarDays} title={tb("Bara en gång")} selected={draft.repeat === "none"} onPress={() => set({ repeat: "none" })} />
          <ChoiceCard icon={Repeat} title={tb("Varje vecka")} subtitle={draft.date ? tb("Varje {{0}}", { 0: dayText(draft.date).split(" ")[0] }) : undefined} selected={draft.repeat === "weekly"} onPress={() => set({ repeat: "weekly" })} />
          <ChoiceCard icon={Repeat} title={tb("Varannan vecka")} selected={draft.repeat === "biweekly"} onPress={() => set({ repeat: "biweekly" })} />
          <ChoiceCard icon={Repeat} title={tb("Varje månad")} subtitle={tb("Samma datum varje månad")} selected={draft.repeat === "monthly"} onPress={() => set({ repeat: "monthly" })} />
          <ChoiceCard icon={CalendarRange} title={tb("Välj datumen själv")} selected={draft.repeat === "custom"} onPress={() => set({ repeat: "custom" })} />
          {(draft.repeat === "weekly" || draft.repeat === "biweekly" || draft.repeat === "monthly") && (
            <View style={{ gap: 10 }}>
              <Text style={s.small}>{tb("Hur många gånger?")}</Text>
              <View style={s.chips}>
                {[2, 4, 6, 8, 12].map((n) => <Chip key={n} label={tb("{{0}} gånger", { 0: n })} selected={draft.count === n} onPress={() => set({ count: n })} />)}
              </View>
              {dates.length > 1 && <Note text={tb("Sista gången: {{0}}", { 0: dayText(dates[dates.length - 1]) })} />}
            </View>
          )}
          {draft.repeat === "custom" && (
            <View style={s.card}>
              <DateCalendar value={{ mode: "multi", dates: [...new Set([draft.date!, ...draft.custom])] }}
                onChange={(v) => v.mode === "multi" && set({ custom: v.dates.filter((d) => d !== draft.date) })} />
            </View>
          )}
        </StepLayout>
      );
      break;
    case "image":
      content = (
        <StepLayout title={tb("Välj en bild")} subtitle={tb("Bilden syns stort i kalendern. Era egna bilder finns här – eller ta en ny.")} footer={next} scroll>
          <ImageChooser placeId={placeId} images={images} value={draft.image} onChange={(url) => set({ image: url })} onError={(m) => toast.current?.show(m)} />
        </StepLayout>
      );
      break;
    case "about":
      content = (
        <StepLayout title={tb("Berätta mer")} subtitle={tb("Vad händer, vad kostar det och hur gör man?")} scroll
          footer={<AuthButton label={tb("Fortsätt")} onPress={wizard.next} disabled={draft.description.trim().length < 2 || !draft.category} />}>
          <PortalField label={tb("Om evenemanget")} value={draft.description} multiline maxLength={2000}
            placeholder={tb("T.ex. Allsångsquiz från kl 18. Boka bord via hemsidan eller ring oss.")} onChangeText={(v) => set({ description: v })} />
          <Text style={s.small}>{tb("Vilken sorts evenemang?")}</Text>
          <View style={s.chips}>
            {EVENT_CATEGORIES.map((c) => <Chip key={c} label={c} selected={draft.category === c} onPress={() => set({ category: draft.category === c ? null : c })} />)}
          </View>
        </StepLayout>
      );
      break;
    case "details":
      content = (
        <StepLayout title={tb("Bra att veta")} scroll
          footer={<AuthButton label={tb("Fortsätt")} onPress={wizard.next} disabled={draft.entry !== "free" && draft.link.trim() !== "" && link === false} />}>
          <View style={s.chips}>
            <Chip icon={Home} label={tb("Inomhus")} selected={draft.indoor} onPress={() => set({ indoor: !draft.indoor })} />
            <Chip icon={UtensilsCrossed} label={tb("Mat och dryck")} selected={draft.food} onPress={() => set({ food: !draft.food })} />
            <Chip icon={Car} label={tb("Parkering")} selected={draft.parking} onPress={() => set({ parking: !draft.parking })} />
            <Chip icon={Baby} label={tb("Barnvänligt")} selected={draft.child} onPress={() => set({ child: !draft.child })} />
            <Chip icon={Dog} label={tb("Hundvänligt")} selected={draft.dog} onPress={() => set({ dog: !draft.dog })} />
            <Chip icon={Accessibility} label={tb("Tillgängligt med rullstol")} selected={draft.access} onPress={() => set({ access: !draft.access })} />
          </View>
          <Text style={[s.small, { marginTop: 8 }]}>{tb("Behöver man biljett?")}</Text>
          <ChoiceCard title={tb("Nej, det är bara att komma")} selected={draft.entry === "free"} onPress={() => set({ entry: "free" })} />
          <ChoiceCard icon={Ticket} title={tb("Ja, biljett behövs")} selected={draft.entry === "tickets"} onPress={() => set({ entry: "tickets" })} />
          <ChoiceCard icon={CalendarCheck} title={tb("Ja, man behöver boka")} selected={draft.entry === "booking"} onPress={() => set({ entry: "booking" })} />
          {draft.entry !== "free" && (
            <PortalField label={draft.entry === "tickets" ? tb("Länk till biljetterna (valfritt)") : tb("Länk för att boka (valfritt)")} value={draft.link}
              keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder={tb("T.ex. ertforetag.se/boka")} error={linkError}
              onChangeText={(v) => { set({ link: v }); if (linkError && cleanUrl(v) !== false) setLinkError(null); }}
              onBlur={() => setLinkError(draft.link.trim() && cleanUrl(draft.link) === false ? tb("Länken ser inte rätt ut.") : null)} />
          )}
          <View style={s.toggleRow}>
            <Text style={s.toggleText}>{tb("Det är på en annan plats än hos oss")}</Text>
            <IconSwitch value={draft.otherPlace} onChange={(v) => set({ otherPlace: v })} />
          </View>
          {draft.otherPlace && (
            <PortalField label={tb("Var?")} value={draft.location} maxLength={120} placeholder={tb("T.ex. Kiviks hamn")} onChangeText={(v) => set({ location: v })} />
          )}
        </StepLayout>
      );
      break;
    case "review": {
      const preview = { date: payload.date, end_date: payload.end_date, time: payload.time };
      // Hela panelen som gästerna får upp, med det som är ifyllt (sparas inte, id -1)
      const showSheet = () => openEvent(-1, {
        event: {
          ...payload, id: -1, place_id: place.id, created_at: new Date().toISOString(), created_by: null,
          is_featured: false, is_sold_out: false, logo_url: null, series_id: null, tickets_release_at: null, website_url: null,
          place: { id: place.id, name: place.name, logo_url: place.logo_url, lat: place.lat, lng: place.lng },
        } as Event,
        saved: false,
        onToggleSave: () => {},
      });
      content = (
        <StepLayout title={tb("Så här ser det ut")} subtitle={dates.length > 1 ? tb("{{0}} tillfällen, från {{1}} till {{2}}.", { 0: dates.length, 1: dayText(dates[0]), 2: dayText(dates[dates.length - 1]) }) : undefined} scroll
          footer={<>
            {error && <FieldNote tone="danger" text={error} />}
            <AuthButton label={editingId ? tb("Spara ändringarna") : dates.length > 1 ? tb("Publicera {{0}} tillfällen", { 0: dates.length }) : tb("Publicera")} onPress={onPublish} loading={busy} />
          </>}>
          <Pressable style={({ pressed }) => [s.preview, pressed && { opacity: 0.85 }]} onPress={showSheet} accessibilityRole="button">
            <View style={s.previewImage}>
              {!!payload.image_url && <ExpoImage source={{ uri: payload.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
              <DateBox event={preview} style={s.previewDate} />
            </View>
            <View style={{ padding: 14, gap: 4 }}>
              <Text style={s.previewTitle} numberOfLines={2}>{payload.title}</Text>
              <Text style={s.previewMeta} numberOfLines={1}>{[eventWhen(preview, currentLanguage()), payload.location ?? place.name].join("  ·  ")}</Text>
              <Text style={[s.previewHint, { color: colors.goldText }]}>{tb("Tryck för att se hela evenemanget")}</Text>
            </View>
          </Pressable>
          <Note text={tb("Evenemanget syns i Kalendern, på er sida och för dem som sparat er som favorit.")} />
        </StepLayout>
      );
      break;
    }
    case "done":
      content = (
        <DoneMoment
          title={editingId ? tb("Sparat!") : tb("Evenemanget är ute!")}
          text={editingId ? tb("Ändringen syns direkt i appen.") : tb("Nu syns det i Kalendern och på er sida.")}
          primary={{ label: tb("Klart"), onPress: () => router.back() }}
        />
      );
      break;
  }

  return (
    <>
      <WizardFrame stepKey={wizard.step} progress={(wizard.index + 1) / (wizard.count - 1)} forward={wizard.forward}
        onBack={() => (wizard.first ? leave() : wizard.back())} hideBar={wizard.step === "done"}>
        {content}
      </WizardFrame>
      <PortalToast ref={toast} />
    </>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  small: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.muted },
  card: { padding: 12, borderRadius: 18, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  toggleText: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  picked: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, textAlign: "center" },
  timeRow: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 4 },
  preview: { borderRadius: 20, overflow: "hidden", backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  previewImage: { height: 190, backgroundColor: c.fill },
  previewDate: { position: "absolute", top: 12, left: 12 },
  previewTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, lineHeight: 23, color: c.text },
  previewMeta: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.muted },
  previewHint: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, marginTop: 6 },
});
