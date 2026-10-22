/**
 * Nytt erbjudande i Österlenpasset — eller ändra/kopiera ett. Ett steg i taget:
 *   1. Vad får gästen? (med förslag)       5. Bild (era egna, eller en ny)
 *   2. Vad är det värt?                    6. Villkor (valfritt)
 *   3. Hur ofta får man använda det?       7. Så här ser det ut — Publicera
 *   4. Hur länge gäller det?
 * Kategorin tas från platsen, så den frågan slipper man.
 *
 * Har någon redan använt erbjudandet går bara bilden och slutdatumet att ändra (databasen kräver
 * det också): annars kunde man lova en sak och ge en annan.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSharedValue } from "react-native-reanimated";
import { CalendarDays, CalendarRange, Infinity as InfinityIcon, Repeat, Sun, Ticket } from "lucide-react-native";
import { AuthButton, FieldNote } from "@/components/auth/AuthParts";
import { StepLayout } from "@/components/onboarding/StepLayout";
import { OfferTicket } from "@/components/offers/OfferTicket";
import type { TearEdge } from "@/components/offers/OfferDrawer";
import { Chip, ChoiceCard, Note, PortalField, PortalToast, type PortalToastHandle } from "@/components/business/PortalParts";
import { DateCalendar, addDaysIso, rangeText, todayIso } from "@/components/business/Pickers";
import { useScreenEntered, useWizard, WizardFrame } from "@/components/business/Wizard";
import { DoneMoment, ImageChooser } from "@/components/business/WizardParts";
import { useBusinessOffers, useBusinessPlace, useOfferActions, usePortalPlace, type OfferDraft } from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, offerCategoryFor } from "@/lib/business";
import type { Offer } from "@/lib/offers";
import { pushOnce } from "@/lib/navigateOnce";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

type Step = "title" | "value" | "use" | "time" | "image" | "terms" | "review" | "done";
const ALL: Step[] = ["title", "value", "use", "time", "image", "terms", "review", "done"];
const LOCKED: Step[] = ["time", "image", "review", "done"];

const SUGGESTIONS = ["10 % rabatt", "2 för 1", "Gratis kaffe till maten", "Bjuder på efterrätten", "Fri entré för barn", "15 % på hela köpet"];

type Interval = "once" | "daily" | "weekly" | "monthly" | "unlimited";
type Expiry = "weeks2" | "month1" | "summer" | "none" | "date";

const INTERVALS: { id: Interval; title: string; sub: string; tag?: string }[] = [
  { id: "once", title: "En gång per medlem", sub: "Varje medlem kan använda det en gång.", tag: "Vanligast" },
  { id: "weekly", title: "En gång i veckan", sub: "Bra för lunch, fika och stamgäster." },
  { id: "monthly", title: "En gång i månaden", sub: "Kommer tillbaka varje månad." },
  { id: "daily", title: "En gång om dagen", sub: "För det man köper ofta." },
  { id: "unlimited", title: "Hur ofta som helst", sub: "Gäller varje gång man handlar." },
];

/** Slutet av dagen, som tid */
const endOfDay = (iso: string) => new Date(`${iso}T23:59:00`).toISOString();

function expiryDate(choice: Expiry, picked: string | null): string | null {
  const today = todayIso();
  if (choice === "none") return null;
  if (choice === "weeks2") return addDaysIso(today, 14);
  if (choice === "month1") return addDaysIso(today, 30);
  if (choice === "summer") return `${new Date().getFullYear()}-08-31`;
  return picked;
}

interface Draft {
  title: string;
  value: string;
  label: string;
  labelTouched: boolean;
  interval: Interval;
  limit: number | null;
  expiry: Expiry;
  picked: string | null;
  image: string | null;
  description: string;
}

export default function OfferComposer() {
  const router = useRouter();
  const s = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ id?: string; copy?: string }>();
  const { placeId, mine } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const { data: offers } = useBusinessOffers(placeId);
  const actions = useOfferActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const editingId = params.id ?? null;
  const source = offers?.find((o) => o.offer.id === (params.id ?? params.copy));
  const locked = !!editingId && !!source && source.redemptions > 0;
  const wizard = useWizard(locked ? LOCKED : ALL);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const entered = useScreenEntered();
  const titleRef = useRef<TextInput>(null);
  // Första fältet får fokus när sidan glidit in klart (då följer knappen tangentbordet mjukt)
  useEffect(() => {
    if (entered && wizard.step === "title" && draft && !editingId) titleRef.current?.focus();
  }, [entered, wizard.step, !!draft, editingId]);
  const images = useMemo(() => placeImages(place?.image_url), [place?.image_url]);
  const summer = new Date().getMonth() <= 6;

  // Utgångsläget: tomt, eller erbjudandet man ändrar/kopierar
  useEffect(() => {
    if (draft || !place) return;
    if ((params.id || params.copy) && !offers) return;
    const o = source?.offer;
    const exp = o?.expires_at && !params.copy ? o.expires_at.slice(0, 10) : null;
    setDraft({
      title: o?.title ?? "",
      value: o?.savings_value != null ? String(o.savings_value) : "",
      label: o?.savings_label ?? "",
      labelTouched: !!o?.savings_label,
      interval: ((o?.redemption_interval as Interval) ?? "once"),
      limit: o?.redemption_limit ?? null,
      expiry: exp ? "date" : o && !params.copy ? "none" : "month1",
      picked: exp,
      image: o?.image_url ?? images[0] ?? null,
      description: o?.description ?? "",
    });
  }, [draft, place, offers, source, params.id, params.copy, images]);

  const edge = { amt: useSharedValue(0), prog: useSharedValue(0), active: useSharedValue(0) } as TearEdge;

  if (!draft || !place || !mine) {
    return <WizardFrame stepKey="loading" progress={0} forward onBack={() => router.back()}><View /></WizardFrame>;
  }

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const leave = () => {
    const dirty = !editingId && draft.title.trim().length > 0 && wizard.step !== "done";
    if (!dirty) { router.back(); return; }
    Alert.alert("Sluta skapa erbjudandet?", "Det du fyllt i sparas inte.", [
      { text: "Fortsätt skriva", style: "cancel" },
      { text: "Sluta", style: "destructive", onPress: () => router.back() },
    ]);
  };
  const back = () => (wizard.first ? leave() : wizard.back());

  const expiresIso = expiryDate(draft.expiry, draft.picked);
  const value = draft.value ? Number(draft.value.replace(/\D/g, "")) : null;
  const label = draft.labelTouched ? draft.label.trim() : value ? `Spara ${value.toLocaleString("sv-SE")} kr` : "";
  const payload: OfferDraft = {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    savings_label: label || null,
    savings_value: value,
    category: source?.offer.category ?? offerCategoryFor(place.categories),
    redemption_interval: draft.interval,
    redemption_limit: draft.interval === "once" ? null : draft.limit,
    expires_at: expiresIso ? endOfDay(expiresIso) : null,
    image_url: draft.image,
  };
  const preview: Offer = {
    id: "preview", place_id: placeId, user_id: "", title: payload.title || "Ert erbjudande",
    description: payload.description, image_url: payload.image_url, savings_label: payload.savings_label,
    savings_value: payload.savings_value, category: payload.category, redemption_limit: payload.redemption_limit,
    redemption_interval: payload.redemption_interval, expires_at: payload.expires_at, is_active: true,
    created_at: new Date().toISOString(),
    place: { name: place.name, logo_url: place.logo_url, categories: place.categories, nearest_town: place.nearest_town },
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await actions.save(payload, editingId ?? undefined);
      setSavedId(id);
      wizard.next();
    } catch (e) {
      setError(businessError(e));
    } finally {
      setBusy(false);
    }
  };

  const footer = (ok: boolean, label = "Fortsätt") => <AuthButton label={label} onPress={wizard.next} disabled={!ok} />;

  let content: React.ReactNode = null;
  switch (wizard.step) {
    case "title":
      content = (
        <StepLayout
          title="Vad får gästen?"
          subtitle="Kort och tydligt – det här är det första medlemmarna ser."
          scroll
          footer={footer(draft.title.trim().length >= 2)}
        >
          <PortalField ref={titleRef} label="Erbjudandet" big value={draft.title} maxLength={60} counter={60}
            placeholder="T.ex. 2 för 1 på lunch" onChangeText={(v) => set({ title: v })} returnKeyType="next"
            onSubmitEditing={() => draft.title.trim().length >= 2 && wizard.next()} />
          <View style={s.chips}>
            {SUGGESTIONS.map((t) => <Chip key={t} label={t} selected={draft.title === t} onPress={() => set({ title: t })} />)}
          </View>
        </StepLayout>
      );
      break;
    case "value":
      content = (
        <StepLayout
          title="Vad är det värt?"
          subtitle="Ungefär hur mycket sparar gästen? Det visar hur mycket man sparar med passet."
          scroll
          footer={<>
            <AuthButton label="Fortsätt" onPress={wizard.next} />
          </>}
        >
          <PortalField label="Värde" big value={draft.value} keyboardType="number-pad" maxLength={4} suffix="kr" placeholder="150"
            onChangeText={(v) => set({ value: v.replace(/\D/g, "").slice(0, 4) })}
            error={value != null && value > 5000 ? "Högst 5 000 kr." : null}
            help="Lämna tomt om ni inte vet – det går bra ändå." />
          <PortalField label="Det här står på biljetten" value={label} maxLength={40} placeholder="T.ex. Spara 150 kr eller 20 % rabatt"
            onChangeText={(v) => set({ label: v, labelTouched: true })} />
        </StepLayout>
      );
      break;
    case "use":
      content = (
        <StepLayout title="Hur ofta får man använda det?" footer={footer(true)} scroll>
          {INTERVALS.map((i) => (
            <ChoiceCard key={i.id} title={i.title} subtitle={i.sub} tag={i.tag} selected={draft.interval === i.id} onPress={() => set({ interval: i.id })}
              icon={i.id === "once" ? Ticket : i.id === "unlimited" ? InfinityIcon : Repeat} />
          ))}
          {draft.interval !== "once" && (
            <View style={{ gap: 10, marginTop: 4 }}>
              <Text style={s.small}>Högst antal gånger per medlem</Text>
              <View style={s.chips}>
                {[null, 2, 3, 5, 10].map((n) => (
                  <Chip key={String(n)} label={n == null ? "Ingen gräns" : `${n} gånger`} selected={draft.limit === n} onPress={() => set({ limit: n })} />
                ))}
              </View>
            </View>
          )}
        </StepLayout>
      );
      break;
    case "time":
      content = (
        <StepLayout title="Hur länge gäller det?" subtitle={locked ? "Någon har redan använt erbjudandet, så bara bilden och slutdatumet går att ändra." : "Erbjudandet försvinner av sig självt när tiden gått ut."}
          footer={footer(draft.expiry !== "date" || !!draft.picked)} scroll>
          <ChoiceCard icon={InfinityIcon} title="Tills vidare" subtitle="Tills ni avslutar det själva." selected={draft.expiry === "none"} onPress={() => set({ expiry: "none" })} />
          <ChoiceCard icon={CalendarDays} title="En månad" subtitle={`Till ${rangeText(addDaysIso(todayIso(), 30))}`} selected={draft.expiry === "month1"} onPress={() => set({ expiry: "month1" })} />
          <ChoiceCard icon={CalendarDays} title="Två veckor" subtitle={`Till ${rangeText(addDaysIso(todayIso(), 14))}`} selected={draft.expiry === "weeks2"} onPress={() => set({ expiry: "weeks2" })} />
          {summer && <ChoiceCard icon={Sun} title="Hela sommaren" subtitle="Till 31 augusti" selected={draft.expiry === "summer"} onPress={() => set({ expiry: "summer" })} />}
          <ChoiceCard icon={CalendarRange} title="Välj ett datum" subtitle={draft.expiry === "date" && draft.picked ? `Till ${rangeText(draft.picked)}` : undefined} selected={draft.expiry === "date"} onPress={() => set({ expiry: "date" })} />
          {draft.expiry === "date" && (
            <View style={s.calendar}>
              <DateCalendar value={{ mode: "single", date: draft.picked }} onChange={(v) => v.mode === "single" && set({ picked: v.date })} />
            </View>
          )}
        </StepLayout>
      );
      break;
    case "image":
      content = (
        <StepLayout title="Välj en bild" subtitle="En bild som visar känslan. Era egna bilder finns här – eller ta en ny." footer={footer(true)} scroll>
          <ImageChooser placeId={placeId} images={images} value={draft.image} onChange={(url) => set({ image: url })} onError={(m) => toast.current?.show(m)} />
        </StepLayout>
      );
      break;
    case "terms":
      content = (
        <StepLayout title="Några villkor?" subtitle="Valfritt. Skriv det gästen behöver veta – när det gäller och hur man gör."
          footer={<AuthButton label={draft.description.trim() ? "Fortsätt" : "Hoppa över"} onPress={wizard.next} />}>
          <PortalField label="Villkor" value={draft.description} multiline maxLength={400} counter={400}
            placeholder="T.ex. Gäller vardagar 11–14. Visa erbjudandet innan du beställer." onChangeText={(v) => set({ description: v })} />
        </StepLayout>
      );
      break;
    case "review":
      content = (
        <StepLayout title="Så här ser det ut" subtitle="Precis så här visas det för medlemmarna." scroll
          footer={<>
            {error && <FieldNote tone="danger" text={error} />}
            <AuthButton label={editingId ? "Spara ändringarna" : "Publicera"} onPress={publish} loading={busy} />
          </>}>
          <View pointerEvents="none">
            <OfferTicket offer={preview} used={false} torn={false} edge={edge} linkPlace={false} onOpen={() => {}} />
          </View>
          <View style={s.summary}>
            <SummaryRow label="Gäller" value={expiresIso ? `till ${rangeText(expiresIso)}` : "tills vidare"} />
            <SummaryRow label="Används" value={INTERVALS.find((i) => i.id === draft.interval)?.title.toLowerCase() ?? ""} />
            {value ? <SummaryRow label="Värde" value={`${value.toLocaleString("sv-SE")} kr`} /> : null}
          </View>
          <Note text="Ni kan pausa eller avsluta det när som helst under Erbjudanden." />
        </StepLayout>
      );
      break;
    case "done":
      content = (
        <DoneMoment
          title={editingId ? "Sparat!" : "Erbjudandet är ute!"}
          text={editingId ? "Ändringen syns direkt i appen." : "Nu syns det för alla med Österlenpasset – på er sida och under Förmåner."}
          primary={{ label: "Klart", onPress: () => router.back() }}
          secondary={editingId ? undefined : {
            label: "Berätta om det i en story",
            onPress: () => { router.back(); setTimeout(() => pushOnce(router, `/business/story?place=${placeId}&offer=${savedId}`), 350); },
          }}
        />
      );
      break;
  }

  return (
    <>
      <WizardFrame
        stepKey={wizard.step}
        progress={(wizard.index + 1) / (wizard.count - 1)}
        forward={wizard.forward}
        onBack={back}
        hideBar={wizard.step === "done"}
      >
        {content}
      </WizardFrame>
      <PortalToast ref={toast} />
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.sumRow}>
      <Text style={s.sumLabel}>{label}</Text>
      <Text style={s.sumValue}>{value}</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  small: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.muted },
  calendar: { padding: 12, borderRadius: 18, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  summary: { borderRadius: 18, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingHorizontal: 16 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  sumLabel: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.muted },
  sumValue: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text },
});
