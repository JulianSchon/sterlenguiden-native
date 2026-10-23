/**
 * Mitt företag — startsidan. Byggd för den som har bråttom: det viktigaste i dag överst.
 *
 * Uppifrån: platsen (bild, namn, "Visa sidan"), I dag (läget just nu, Stängt i dag med ett tryck,
 * Ändra i dag), Kom igång (det som saknas för en komplett sida, tills allt är klart), Skapa
 * (berättelse, erbjudande, evenemang), Veckan (hur många som tittat, i en mening), Just nu (det
 * som är ute), Er sida (allt man kan ändra) och Mer (erbjudanden, evenemang, statistik, personal,
 * inställningar, hjälp).
 *
 * Första gången man kommer hit visas välkomsten och villkoren (business/welcome). Sköter man inget
 * företag kommer man till "För företag" (business/start).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import {
  ArrowUpRight, BarChart3, CalendarDays, CalendarPlus, Camera, Check, ChevronRight, Clock, DoorClosed, Eye,
  FileText, Images, LayoutGrid, LifeBuoy, ListChecks, Phone, Repeat, Settings2, Ticket, Undo2, Users,
} from "lucide-react-native";
import { Lock } from "lucide-react-native";

/** Vilken behörighet varje sida kräver (personal kan ha fått bara en del, se Personal) */
const PAGE_PERMISSION: Record<string, Permission> = {
  hours: "info", about: "info", photos: "info", contact: "info", categories: "info", amenities: "info",
  story: "stories", stories: "stories", offer: "offers", offers: "offers", event: "events", events: "events",
};
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { PressableScale } from "@/components/PressableScale";
import { Sheet } from "@/components/Sheet";
import { PortalToast, type PortalToastHandle } from "@/components/business/PortalParts";
import { TodaySheet, type TodayChange } from "@/components/business/TodaySheet";
import { useHoursColors } from "@/components/place/PlaceHours";
import {
  useBusinessOffers, useBusinessPlace, useBusinessStats, usePlaceEvents, usePlaceStories, usePortalPlace, useUpdatePlace,
} from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, canDo, type BusinessPlace, type MyPlace, type Permission } from "@/lib/business";
import { BUSINESS_EMAIL as HELP_EMAIL } from "@/lib/appInfo";
import { hasAnyHours, isHotel, noFixedHoursKey, setToday, todayOnly } from "@/lib/hoursEditor";
import { effectiveHours, hoursStatus } from "@/lib/openingHours";
import { pushOnce } from "@/lib/navigateOnce";
import { dayKey, lastDay } from "@/lib/events";
import { findCategory } from "@/theme/categories";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";


export default function BusinessHome() {
  const router = useRouter();
  const { placeId, mine, places, loading, error, refetch } = usePortalPlace();

  // Inget företag: till "För företag". Första gången: välkomsten och villkoren.
  useEffect(() => {
    if (loading || error) return;
    if (!mine) router.replace(places.length > 0 ? `/business?place=${places[0].id}` as never : "/business/start" as never);
    else if (!mine.terms_accepted_at) router.replace(`/business/welcome?place=${mine.id}`);
  }, [loading, error, mine, places, router]);

  // Inget nät (eller ett fel): säg det, i stället för att skicka iväg en företagare till "För företag"
  if (error) return <HomeError message={businessError(error)} onRetry={() => refetch()} />;
  if (!mine || !mine.terms_accepted_at) return <HomeSkeleton />;
  return <Home mine={mine} places={places} placeId={placeId} />;
}

function Home({ mine, places, placeId }: { mine: MyPlace; places: MyPlace[]; placeId: number }) {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { data: place } = useBusinessPlace(placeId);
  const { data: offers = [] } = useBusinessOffers(placeId);
  const { data: stories = [] } = usePlaceStories(placeId);
  const { data: events = [] } = usePlaceEvents(placeId);
  const stats = useBusinessStats(placeId, 7);
  const update = useUpdatePlace(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const [todayOpen, setTodayOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  const locked = useCallback((page: string) => !!PAGE_PERMISSION[page] && !canDo(mine, PAGE_PERMISSION[page]), [mine]);
  const askOwner = useCallback(() => Alert.alert("Låst för dig", `Det här har du inte fått tillgång till. Fråga en ägare för ${mine.name} – de kan ändra det under Personal.`), [mine.name]);
  const go = useCallback((page: string, extra = "") => {
    if (locked(page)) { askOwner(); return; }
    pushOnce(router, `/business/${page}?place=${placeId}${extra}`);
  }, [router, placeId, locked, askOwner]);
  const lockIcon = (page: string) => (locked(page) ? <Lock size={16} color={colors.faint} strokeWidth={2} /> : undefined);

  const saveToday = async (change: TodayChange) => {
    if (!place) return;
    if (locked("hours")) { askOwner(); return; }
    setTodayOpen(false);
    const before = place.hours_exceptions ?? [];
    try {
      await update.mutateAsync({ hours_exceptions: setToday(before, change) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.current?.show(change === null ? "Vanliga tider i dag" : change.closed ? "Stängt i dag – det syns i appen" : "Dagens tider ändrade",
        () => update.mutate({ hours_exceptions: before }));
    } catch (e) {
      toast.current?.show(businessError(e));
    }
  };

  const activeStories = stories.filter((st) => st.expires_at && new Date(st.expires_at).getTime() > Date.now());
  const activeOffers = offers.filter((o) => o.offer.is_active && (!o.offer.expires_at || new Date(o.offer.expires_at).getTime() > Date.now()));
  const today = dayKey(new Date());
  const upcoming = events.filter((e) => (lastDay(e) ?? "") >= today);

  const eye = (
    <TouchableOpacity
      style={s.eye}
      onPress={() => pushOnce(router, `/place/${placeId}`)}
      hitSlop={8}
      accessibilityLabel="Visa er sida som gästerna ser den"
    >
      <Eye size={17} color={colors.text} strokeWidth={2} />
      <Text style={s.eyeText}>Visa sidan</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <SettingsScreen title="Mitt företag" right={eye}>
        <Rise index={0}>
          <Hero mine={mine} place={place} onSwitch={places.length > 1 ? () => setSwitchOpen(true) : undefined} />
        </Rise>

        <Rise index={1}>
          {place ? (
            <TodayCard place={place} onCloseToday={() => saveToday({ closed: true, label: null })} onChange={() => (locked("hours") ? askOwner() : setTodayOpen(true))} onUndo={() => saveToday(null)} onHours={() => go("hours")} />
          ) : (
            <Skeleton height={132} radius={22} />
          )}
        </Rise>

        {place && !locked("hours") && (
          <Tasks
            placeId={placeId}
            place={place}
            hasOffer={offers.length > 0}
            onOpen={(page) => (page === "offer" ? go("offer") : go(page))}
          />
        )}

        <Rise index={2}>
          <View>
            <Text style={s.label}>Skapa</Text>
            <View style={s.createRow}>
              <CreateTile Icon={Camera} title="Story" locked={locked("story")} sub="Visa dagen" onPress={() => go("story")} />
              <CreateTile Icon={Ticket} title="Erbjudande" locked={locked("offer")} sub="I Österlenpasset" onPress={() => go("offer")} />
              <CreateTile Icon={CalendarPlus} title="Evenemang" locked={locked("event")} sub="Bjud in gäster" onPress={() => go("event")} />
            </View>
          </View>
        </Rise>

        {stats.isError ? null : (
          <Rise index={3}>
            <WeekCard stats={stats.data} onPress={() => go("stats")} />
          </Rise>
        )}

        {(activeStories.length > 0 || activeOffers.length > 0 || upcoming.length > 0) && (
          <Rise index={4}>
            <SettingsGroup label="Just nu">
              {activeStories.length > 0 && (
                <SettingsRow
                  icon={Camera}
                  label={activeStories.length === 1 ? "1 story ute nu" : `${activeStories.length} stories ute nu`}
                  subtitle={`${activeStories.reduce((n, st) => n + st.views, 0)} har sett ${activeStories.length === 1 ? "den" : "dem"}`}
                  right={lockIcon("stories")}
                  onPress={() => go("stories")}
                />
              )}
              {activeOffers.length > 0 && (
                <SettingsRow
                  icon={Ticket}
                  label={activeOffers.length === 1 ? "1 erbjudande igång" : `${activeOffers.length} erbjudanden igång`}
                  subtitle={`Använt ${activeOffers.reduce((n, o) => n + o.recent, 0)} gånger senaste 30 dagarna`}
                  right={lockIcon("offers")}
                  onPress={() => go("offers")}
                />
              )}
              {upcoming.length > 0 && (
                <SettingsRow
                  icon={CalendarDays}
                  label={`Nästa: ${upcoming[0].title}`}
                  subtitle={upcoming.length === 1 ? "1 kommande evenemang" : `${upcoming.length} kommande evenemang`}
                  right={lockIcon("events")}
                  onPress={() => go("events")}
                />
              )}
            </SettingsGroup>
          </Rise>
        )}

        <Rise index={5}>
          <SettingsGroup label="Er sida">
            <SettingsRow icon={Clock} label="Öppettider" value={place ? (hasAnyHours(place.opening_hours) ? undefined : "Saknas") : undefined} right={lockIcon("hours")} onPress={() => go("hours")} />
            <SettingsRow icon={FileText} label="Om er" value={place && !place.short_description ? "Saknas" : undefined} right={lockIcon("about")} onPress={() => go("about")} />
            <SettingsRow icon={Images} label="Bilder och logga" value={place ? `${placeImages(place.image_url).length} bilder` : undefined} right={lockIcon("photos")} onPress={() => go("photos")} />
            <SettingsRow icon={Phone} label="Kontakt och länkar" right={lockIcon("contact")} onPress={() => go("contact")} />
            <SettingsRow icon={LayoutGrid} label="Kategori och meny" right={lockIcon("categories")} onPress={() => go("categories")} />
            <SettingsRow icon={ListChecks} label="Det här finns hos er" subtitle="Parkering, wifi, hundvänligt …" right={lockIcon("amenities")} onPress={() => go("amenities")} />
          </SettingsGroup>
        </Rise>

        <Rise index={6}>
          <SettingsGroup label="Mer">
            <SettingsRow icon={Ticket} label="Erbjudanden" value={activeOffers.length ? `${activeOffers.length} igång` : undefined} right={lockIcon("offers")} onPress={() => go("offers")} />
            <SettingsRow icon={CalendarDays} label="Evenemang" value={upcoming.length ? `${upcoming.length} kommande` : undefined} right={lockIcon("events")} onPress={() => go("events")} />
            <SettingsRow icon={Camera} label="Stories" right={lockIcon("stories")} onPress={() => go("stories")} />
            <SettingsRow icon={BarChart3} label="Statistik" onPress={() => go("stats")} />
            <SettingsRow
              icon={Users}
              label="Personal"
              value={mine.requests > 0 ? `${mine.requests} vill gå med` : undefined}
              onPress={() => go("team")}
            />
            <SettingsRow icon={Settings2} label="Inställningar" onPress={() => go("settings")} />
          </SettingsGroup>
        </Rise>

        <Rise index={7}>
          <SettingsGroup>
            <SettingsRow
              compact
              icon={LifeBuoy}
              label="Behöver ni hjälp?"
              subtitle={`Mejla oss på ${HELP_EMAIL} – vi svarar personligen.`}
              tint={colors.warm}
              onPress={() => Linking.openURL(`mailto:${HELP_EMAIL}?subject=${encodeURIComponent(`Hjälp med ${mine.name}`)}`).catch(() => {})}
            />
          </SettingsGroup>
        </Rise>
      </SettingsScreen>

      {place && (
        <TodaySheet
          visible={todayOpen}
          hours={place.opening_hours}
          exceptions={place.hours_exceptions}
          onClose={() => setTodayOpen(false)}
          onSave={saveToday}
        />
      )}
      <Sheet visible={switchOpen} onClose={() => setSwitchOpen(false)} title="Byt företag">
        <View style={{ gap: 8 }}>
          {places.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[s.switchRow, p.id === placeId && { borderColor: colors.goldBorder }]}
              activeOpacity={0.75}
              onPress={() => { setSwitchOpen(false); router.replace(`/business?place=${p.id}`); }}
            >
              <PlaceThumb mine={p} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={s.switchName} numberOfLines={1}>{p.name}</Text>
                <Text style={s.switchSub}>{p.role === "owner" ? "Ägare" : "Personal"}{p.town ? ` · ${p.town}` : ""}</Text>
              </View>
              {p.id === placeId && <Check size={18} color={colors.goldText} strokeWidth={2.4} />}
            </TouchableOpacity>
          ))}
        </View>
      </Sheet>
      <PortalToast ref={toast} />
    </>
  );
}

// ── Platsen överst ──────────────────────────────────────────────────────────

function Hero({ mine, place, onSwitch }: { mine: MyPlace; place: BusinessPlace | undefined; onSwitch?: () => void }) {
  const s = useThemedStyles(createStyles);
  const image = placeImages(place?.image_url ?? mine.image_url)[0];
  const cat = findCategory(place?.categories ?? mine.categories);
  return (
    <View style={s.hero}>
      {image ? (
        <ExpoImage source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} />
      ) : (
        <LinearGradient colors={[cat?.screen ?? "#3A3020", "#121212"]} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]} style={StyleSheet.absoluteFill} />
      <View style={s.heroBody}>
        <PlaceThumb mine={{ ...mine, logo_url: place?.logo_url ?? mine.logo_url }} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={s.heroName} numberOfLines={2}>{place?.name ?? mine.name}</Text>
          <Text style={s.heroSub}>{mine.role === "owner" ? "Ägare" : "Personal"}{mine.town ? ` · ${mine.town}` : ""}</Text>
        </View>
        {onSwitch && (
          <TouchableOpacity style={s.heroSwitch} onPress={onSwitch} hitSlop={8} accessibilityLabel="Byt företag">
            <Repeat size={15} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={s.heroSwitchText}>Byt</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function PlaceThumb({ mine, size }: { mine: Pick<MyPlace, "logo_url" | "image_url" | "name" | "categories">; size: number }) {
  const { colors } = useTheme();
  const uri = mine.logo_url ?? placeImages(mine.image_url)[0];
  const Icon = findCategory(mine.categories)?.icon;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)" }}>
      {uri ? (
        <ExpoImage source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit={mine.logo_url ? "contain" : "cover"} />
      ) : Icon ? (
        <Icon size={size * 0.45} color={colors.onGold} strokeWidth={1.8} />
      ) : null}
    </View>
  );
}

// ── I dag ───────────────────────────────────────────────────────────────────

function TodayCard({ place, onCloseToday, onChange, onUndo, onHours }: {
  place: BusinessPlace; onCloseToday: () => void; onChange: () => void; onUndo: () => void; onHours: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const tint = useHoursColors();
  const status = hoursStatus(effectiveHours(place.opening_hours, place.hours_exceptions), undefined, "sv");
  const own = todayOnly(place.hours_exceptions);
  const closedToday = own?.closed === true;

  return (
    <GradientCard>
      <View style={s.todayBody}>
        <Text style={s.label}>I dag</Text>
        {status ? (
          <View style={s.todayStatus}>
            <View style={[s.dot, { backgroundColor: tint[status.state] }]} />
            <Text style={[s.todayText, { color: tint[status.state] }]} numberOfLines={1}>{status.label}</Text>
          </View>
        ) : (
          <TouchableOpacity onPress={onHours} activeOpacity={0.7} style={s.todayStatus}>
            <Text style={s.todayEmpty}>Inga öppettider än · </Text>
            <Text style={[s.todayEmpty, { color: colors.goldText }]}>Fyll i</Text>
          </TouchableOpacity>
        )}
        {own && (
          <View style={s.ownRow}>
            <Text style={s.ownText}>{closedToday ? "Ni har stängt i dag – det syns i appen." : "Ni har ändrat dagens tider."}</Text>
            <TouchableOpacity onPress={onUndo} hitSlop={8} style={s.ownUndo} accessibilityRole="button">
              <Undo2 size={14} color={colors.goldText} strokeWidth={2.2} />
              <Text style={s.ownUndoText}>Ångra</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={s.todayButtons}>
          {!closedToday && status && (
            <View style={{ flex: 1 }}>
              <PressableScale scale={0.97} style={[s.todayBtn, s.todayBtnStrong]} onPress={onCloseToday} accessibilityRole="button">
                <DoorClosed size={17} color={colors.text} strokeWidth={2} />
                <Text style={s.todayBtnText} numberOfLines={1}>Stängt i dag</Text>
              </PressableScale>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <PressableScale scale={0.97} style={s.todayBtn} onPress={status ? onChange : onHours} accessibilityRole="button">
              <Clock size={17} color={colors.text} strokeWidth={2} />
              <Text style={s.todayBtnText} numberOfLines={1}>{status ? "Ändra i dag" : "Öppettider"}</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </GradientCard>
  );
}

// ── Kom igång ───────────────────────────────────────────────────────────────

function Tasks({ placeId, place, hasOffer, onOpen }: {
  placeId: number; place: BusinessPlace; hasOffer: boolean; onOpen: (page: string) => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const key = `business-tasks-hidden:v1:${placeId}`;
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [noHours, setNoHours] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(noFixedHoursKey(placeId)).then((v) => setNoHours(v === "1")).catch(() => {});
  }, [placeId]);
  useEffect(() => {
    AsyncStorage.getItem(key).then((v) => setHidden(v === "1")).catch(() => setHidden(false));
  }, [key]);

  const tasks = useMemo(() => [
    // Hotell (och den som valt "inga fasta öppettider") behöver inga öppettider för att vara klar
    { key: "hours", label: "Fyll i öppettiderna", done: hasAnyHours(place.opening_hours) || noHours || isHotel(place.categories), page: "hours" },
    { key: "about", label: "Skriv några rader om er", done: !!place.short_description?.trim(), page: "about" },
    { key: "photos", label: "Lägg till minst tre bilder", done: placeImages(place.image_url).length >= 3, page: "photos" },
    { key: "logo", label: "Lägg till er logga", done: !!place.logo_url, page: "photos" },
    { key: "contact", label: "Telefon eller hemsida", done: !!(place.phone || place.website_url), page: "contact" },
    { key: "offer", label: "Skapa ert första erbjudande", done: hasOffer, page: "offer" },
  ], [place, hasOffer, noHours]);
  const done = tasks.filter((t) => t.done).length;
  if (hidden !== false || done === tasks.length) return null;
  const left = tasks.filter((t) => !t.done).slice(0, 3);
  const pct = Math.round((done / tasks.length) * 100);

  return (
    <Rise index={1}>
      <GradientCard borderColor={colors.goldBorder}>
        <View style={s.tasksBody}>
          <View style={s.tasksHead}>
            <Text style={s.tasksTitle}>Er sida är {pct} % klar</Text>
            <TouchableOpacity
              onPress={() => { setHidden(true); AsyncStorage.setItem(key, "1").catch(() => {}); }}
              hitSlop={10}
            >
              <Text style={s.tasksHide}>Dölj</Text>
            </TouchableOpacity>
          </View>
          <View style={s.track}>
            <View style={[s.trackFill, { width: `${pct}%` }]} />
          </View>
          <View style={{ marginTop: 6 }}>
            {left.map((t) => (
              <Pressable key={t.key} onPress={() => onOpen(t.page)} style={({ pressed }) => [s.taskRow, pressed && { opacity: 0.6 }]}>
                <View style={s.taskCircle} />
                <Text style={s.taskText}>{t.label}</Text>
                <ChevronRight size={17} color={colors.faint} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        </View>
      </GradientCard>
    </Rise>
  );
}

// ── Skapa ───────────────────────────────────────────────────────────────────

function CreateTile({ Icon, title, sub, onPress, locked = false }: { Icon: typeof Camera; title: string; sub: string; onPress: () => void; locked?: boolean }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  return (
    <View style={{ flex: 1 }}>
      <PressableScale scale={0.95} style={[s.tile, locked && { opacity: 0.55 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
        <View style={s.tileIcon}>
          {locked ? <Lock size={22} color={colors.muted} strokeWidth={1.9} /> : <Icon size={24} color={colors.goldText} strokeWidth={1.9} />}
        </View>
        <Text style={s.tileTitle} numberOfLines={1}>{title}</Text>
        <Text style={s.tileSub} numberOfLines={1}>{sub}</Text>
      </PressableScale>
    </View>
  );
}

// ── Veckan ──────────────────────────────────────────────────────────────────

function WeekCard({ stats, onPress }: { stats: ReturnType<typeof useBusinessStats>["data"]; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  if (!stats) return <Skeleton height={150} radius={22} />;
  const diff = stats.visitors - stats.visitors_prev;
  const headline = stats.visitors === 0
    ? "Ingen har tittat på er sida än i veckan."
    : stats.visitors === 1 ? "1 person tittade på er sida i veckan." : `${stats.visitors} personer tittade på er sida i veckan.`;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.9 }} accessibilityRole="button">
      <GradientCard>
        <View style={s.weekBody}>
          <View style={s.weekHead}>
            <Text style={s.label}>Den här veckan</Text>
            <ArrowUpRight size={18} color={colors.faint} strokeWidth={2} />
          </View>
          <Text style={s.weekHeadline}>{headline}</Text>
          {stats.visitors === 0 ? (
            <Text style={s.weekSub}>Lägg upp en story – den syns direkt överst på Hem.</Text>
          ) : diff !== 0 && stats.visitors_prev > 0 ? (
            <Text style={[s.weekSub, { color: diff > 0 ? colors.success : colors.muted }]}>
              {diff > 0 ? `${diff} fler än veckan innan` : `${-diff} färre än veckan innan`}
            </Text>
          ) : null}
          <View style={s.weekStats}>
            <MiniStat n={stats.clicks} label="klick" />
            <MiniStat n={stats.directions} label="vägbeskr." />
            <MiniStat n={stats.favorites_new} label="sparade" />
            <MiniStat n={stats.redemptions} label="erbjud." />
          </View>
        </View>
      </GradientCard>
    </Pressable>
  );
}

function MiniStat({ n, label }: { n: number; label: string }) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.mini}>
      <Text style={s.miniN}>{n}</Text>
      <Text style={s.miniLabel}>{label}</Text>
    </View>
  );
}

// ── Inget nät ───────────────────────────────────────────────────────────────

function HomeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <SettingsScreen title="Mitt företag">
      <View style={s.errorBox}>
        <Text style={s.errorText}>{message}</Text>
        <TouchableOpacity onPress={onRetry} style={s.retry} activeOpacity={0.75}>
          <Text style={s.retryText}>Försök igen</Text>
        </TouchableOpacity>
      </View>
    </SettingsScreen>
  );
}

// ── Medan det laddar ────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <SettingsScreen title="Mitt företag">
      <Skeleton height={176} radius={22} />
      <Skeleton height={132} radius={22} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Skeleton height={112} radius={18} style={{ flex: 1 }} />
        <Skeleton height={112} radius={18} style={{ flex: 1 }} />
        <Skeleton height={112} radius={18} style={{ flex: 1 }} />
      </View>
      <Skeleton height={150} radius={22} />
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  eye: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  eyeText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.text },
  label: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1.6, color: c.muted,
    textTransform: "uppercase", paddingLeft: 6, marginBottom: 8,
  },

  hero: { height: 176, borderRadius: 22, overflow: "hidden", justifyContent: "flex-end", backgroundColor: c.card },
  heroBody: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  heroName: { fontFamily: "Montserrat_700Bold", fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: "#FFFFFF" },
  heroSub: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.78)", marginTop: 2 },
  heroSwitch: {
    flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 11, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.35)",
  },
  heroSwitchText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FFFFFF" },

  todayBody: { padding: 16, paddingTop: 14 },
  todayStatus: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  todayText: { flexShrink: 1, fontFamily: "Montserrat_700Bold", fontSize: 18, letterSpacing: -0.3 },
  todayEmpty: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.muted },
  ownRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, paddingLeft: 6 },
  ownText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13.5, color: c.muted },
  ownUndo: { flexDirection: "row", alignItems: "center", gap: 5 },
  ownUndoText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.goldText },
  todayButtons: { flexDirection: "row", gap: 10, marginTop: 14 },
  todayBtn: {
    height: 48, paddingHorizontal: 10, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: c.fill, borderWidth: 1, borderColor: c.borderStrong,
  },
  todayBtnStrong: { backgroundColor: c.raised },
  todayBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.text },

  tasksBody: { padding: 16 },
  tasksHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tasksTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: c.text },
  tasksHide: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted },
  track: { height: 6, borderRadius: 3, backgroundColor: c.fill, marginTop: 12, overflow: "hidden" },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: c.gold },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  taskCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: c.goldBorder },
  taskText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5, color: c.text },

  createRow: { flexDirection: "row", gap: 10 },
  tile: {
    borderRadius: 18, paddingVertical: 16, paddingHorizontal: 10, alignItems: "center",
    backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  tileIcon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: c.goldSoft, marginBottom: 10 },
  tileTitle: { fontFamily: "Montserrat_600SemiBold", fontSize: 13.5, color: c.text },
  tileSub: { fontFamily: "Inter_400Regular", fontSize: 11.5, color: c.muted, marginTop: 2 },

  weekBody: { padding: 16, paddingTop: 14 },
  weekHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  weekHeadline: { fontFamily: "Montserrat_700Bold", fontSize: 18, lineHeight: 24, letterSpacing: -0.3, color: c.text, paddingHorizontal: 6 },
  weekSub: { fontFamily: "Inter_500Medium", fontSize: 13.5, lineHeight: 19, color: c.muted, paddingHorizontal: 6, marginTop: 4 },
  weekStats: { flexDirection: "row", marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 12 },
  mini: { flex: 1, alignItems: "center" },
  miniN: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: c.text, fontVariant: ["tabular-nums"] },
  miniLabel: { fontFamily: "Inter_500Medium", fontSize: 11.5, color: c.muted, marginTop: 1 },

  errorBox: { alignItems: "center", gap: 14, paddingVertical: 40 },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 15, lineHeight: 21, color: c.muted, textAlign: "center" },
  retry: { height: 44, paddingHorizontal: 22, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14.5, color: c.text },

  switchRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16,
    borderWidth: 1.5, borderColor: c.border, backgroundColor: c.raised,
  },
  switchName: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: c.text },
  switchSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },
});
