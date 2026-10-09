/**
 * Steg 2 i incheckningens belöning — "Ditt besök": vad besöket förde med sig, en sak i taget.
 *
 *  - Den stora siffran: hur många platser du upptäckt rullar upp (23 → 24) med en kraftig
 *    vibration och ett "+1", och hur stor del av Österlen det är (7,4 % → 7,7 %). Vid
 *    milstolpar (10, 25, 50 …) skjuts konfetti ut.
 *  - Platsens kategori, med samma siffror som på Statistik ("Café & Bageri 5 / 31").
 *  - Utmaningarna besöket flyttade (högst två — de som låses upp spelas sist, som crescendot).
 *    Klaras en nivå blixtrar stapeln, medaljen tänds med konfetti och nästa mål visas direkt,
 *    så man alltid ser vad som väntar härnäst.
 *
 * Varje stapel fylls medan telefonen vibrerar hela vägen (FillBar), och siffran byts i exakt det
 * ögonblick stapeln når fram. Får allt inte plats på skärmen scrollar vyn själv ner till raden
 * som spelas. `skip` hoppar direkt till slutläget; `onReady` anropas när allt är klart.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Reanimated, {
  Easing, interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { TrophyMedal } from "@/components/trophies/TrophyMedal";
import type { Trophy } from "@/lib/achievements";
import { playSound } from "@/lib/sounds";
import { Confetti, FillBar, FlipNumber, GOLD, RollingNumber } from "./CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.58)";
const CARD = "#17171A";
const GREEN = "#4ADE80";
const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250];
const FILL_MS = 1200;
/** Från att en rad dyker upp tills dess stapel börjar fyllas */
const ROW_LEAD = 450;

export interface ProgressItem {
  key: string;
  /** Troféns läge EFTER besöket (namn, nivå, ikon) */
  trophy: Trophy;
  from: number;
  to: number;
  target: number;
  /** Besöket klarade den här nivån */
  unlocked: boolean;
  /** Nästa nivå i samma utmaning — visas direkt när den här klaras */
  next: { levelLabel: string; requirementText: string } | null;
}

export interface CategoryProgress {
  label: string;
  color: string;
  Icon: ComponentType<any>;
  from: number;
  to: number;
  total: number;
}

export interface HeroProgress {
  from: number;
  to: number;
  /** Alla platser i appen, för "x % av Österlen utforskat" */
  total: number;
}

interface RowTiming { appearAt: number; fillAt: number }
type Box = { y: number; h: number };

const formatTenths = (n: number) => `${(n / 10).toFixed(1).replace(".", ",")} %`;

export function ProgressScene({
  hero, category, items, skip, onReady,
}: {
  hero: HeroProgress | null;
  category: CategoryProgress | null;
  items: ProgressItem[];
  skip: boolean;
  onReady: () => void;
}) {
  // Hela tidslinjen räknas ut i förväg — varje rad vet exakt när den ska börja
  const plan = useMemo(() => {
    const milestone = !!hero && MILESTONES.includes(hero.to);
    const heroRollAt = 650;
    let t = hero ? heroRollAt + 1100 + (milestone ? 800 : 0) : 250;
    const celebrates = [...(category ? [category.to >= category.total] : []), ...items.map((it) => it.unlocked)];
    const rows = celebrates.map((celebrate): RowTiming => {
      const timing = { appearAt: t, fillAt: t + ROW_LEAD };
      t = timing.fillAt + FILL_MS + (celebrate ? 1300 : 500);
      return timing;
    });
    return { milestone, heroRollAt, rows, readyAt: t };
  }, [hero, category, items]);

  const readied = useRef(false);
  useEffect(() => {
    const ready = () => {
      if (readied.current) return;
      readied.current = true;
      onReady();
    };
    if (skip) {
      ready();
      return;
    }
    const timer = setTimeout(ready, plan.readyAt);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  // Följ med nedåt: när en rad börjar spelas och inte syns helt, scrolla fram den
  const scrollRef = useRef<ScrollView>(null);
  const view = useRef({ h: 0, contentH: 0, rowsY: 0, scrollY: 0 });
  const rowBoxes = useRef<Box[]>([]);
  const reveal = (i: number) => {
    const v = view.current;
    const row = rowBoxes.current[i];
    if (!row || v.contentH <= v.h) return;
    const want = Math.min(v.contentH - v.h, v.rowsY + row.y + row.h + 20 - v.h);
    if (want > v.scrollY + 4) scrollRef.current?.scrollTo({ y: want, animated: true });
  };
  useEffect(() => {
    if (skip) return;
    const timers = plan.rows.map((r, i) => setTimeout(() => reveal(i), r.appearAt));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const offset = category ? 1 : 0;
  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
      onLayout={(e) => { view.current.h = e.nativeEvent.layout.height; }}
      onContentSizeChange={(_, h) => { view.current.contentH = h; }}
      onScroll={(e) => { view.current.scrollY = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={32}
    >
      <Text style={s.eyebrow}>DITT BESÖK</Text>
      {hero && <HeroCounter hero={hero} rollAt={plan.heroRollAt} milestone={plan.milestone} skip={skip} />}
      <View style={s.rows} onLayout={(e) => { view.current.rowsY = e.nativeEvent.layout.y; }}>
        {category && (
          <CategoryRow cat={category} timing={plan.rows[0]} skip={skip} onBox={(b) => { rowBoxes.current[0] = b; }} />
        )}
        {items.map((it, i) => (
          <TrophyRow
            key={it.key}
            item={it}
            timing={plan.rows[offset + i]}
            skip={skip}
            onBox={(b) => { rowBoxes.current[offset + i] = b; }}
          />
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Den stora siffran ─────────────────────────────────────────────────────────
function HeroCounter({ hero, rollAt, milestone, skip }: { hero: HeroProgress; rollAt: number; milestone: boolean; skip: boolean }) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(0);
  const plus = useSharedValue(0);
  const burst = useSharedValue(0);
  const chip = useSharedValue(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pctFrom = hero.total > 0 ? Math.round((hero.from / hero.total) * 1000) : 0;
  const pctTo = hero.total > 0 ? Math.round((hero.to / hero.total) * 1000) : 0;

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (skip || reduceMotion) {
      plus.value = 1;
      chip.value = milestone ? 1 : 0;
      return;
    }
    plus.value = withDelay(rollAt + 140, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) }));
    if (milestone) {
      timers.current.push(setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        playSound("milestone");
      }, rollAt + 300));
      burst.value = withDelay(rollAt + 300, withTiming(1, { duration: 1400, easing: Easing.linear }));
      chip.value = withDelay(rollAt + 420, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(1.8)) }));
    }
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.16 }] }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: plus.value,
    transform: [{ scale: interpolate(plus.value, [0, 1], [0.4, 1]) }, { translateY: interpolate(plus.value, [0, 1], [10, 0]) }],
  }));
  const chipStyle = useAnimatedStyle(() => ({ opacity: chip.value, transform: [{ scale: interpolate(chip.value, [0, 1], [0.6, 1]) }] }));

  return (
    <View style={s.hero}>
      <View style={s.heroRow}>
        <Reanimated.View style={numberStyle}>
          <RollingNumber
            from={hero.from}
            to={hero.to}
            startAt={rollAt}
            durationMs={300}
            skip={skip}
            style={s.heroNumber}
            onStep={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
              playSound("tick");
              pop.value = withSequence(withTiming(1, { duration: 110 }), withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }));
            }}
          />
        </Reanimated.View>
        <Reanimated.View style={[s.plusBadge, plusStyle]}>
          <Text style={s.plusText}>+{hero.to - hero.from}</Text>
        </Reanimated.View>
        {milestone && <Confetti progress={burst} count={40} power={1.15} />}
      </View>
      <Text style={s.heroLabel}>{hero.total > 0 ? `av ${hero.total} platser upptäckta` : "platser upptäckta"}</Text>
      {hero.total > 0 && (
        <View style={s.pctPill}>
          <RollingNumber
            from={pctFrom}
            to={pctTo}
            startAt={rollAt + 450}
            durationMs={450}
            skip={skip}
            style={s.pctValue}
            align="right"
            format={formatTenths}
            onStep={() => Haptics.selectionAsync().catch(() => {})}
          />
          <Text style={s.pctLabel}> av Österlen utforskat</Text>
        </View>
      )}
      {milestone && (
        <Reanimated.View style={[s.milestoneChip, chipStyle]}>
          <Text style={s.milestoneText}>Milstolpe — din {hero.to}:e plats!</Text>
        </Reanimated.View>
      )}
    </View>
  );
}

// ─── Platsens kategori ─────────────────────────────────────────────────────────
function CategoryRow({ cat, timing, skip, onBox }: { cat: CategoryProgress; timing: RowTiming; skip: boolean; onBox: (b: Box) => void }) {
  const left = Math.max(0, cat.total - cat.to);
  return (
    <ProgressRow
      leading={() => (
        <View style={[s.catIcon, { backgroundColor: cat.color }]}>
          <cat.Icon size={22} color="#FFFFFF" strokeWidth={2} />
        </View>
      )}
      title={cat.label}
      subtitle="Platsens kategori"
      from={cat.from}
      to={cat.to}
      target={cat.total}
      celebrate={left === 0}
      chipText="Hela kategorin besökt!"
      footer={left <= 2 ? `Bara ${left} kvar i kategorin!` : `${left} kvar att upptäcka`}
      footerHot={left <= 2}
      afterUnlock={null}
      timing={timing}
      skip={skip}
      onBox={onBox}
    />
  );
}

// ─── En utmaning ───────────────────────────────────────────────────────────────
function TrophyRow({ item, timing, skip, onBox }: { item: ProgressItem; timing: RowTiming; skip: boolean; onBox: (b: Box) => void }) {
  const t = item.trophy;
  const left = Math.max(0, item.target - item.to);
  return (
    <ProgressRow
      leading={(lit) => <TrophyMedal size={46} tier={t.tier} Icon={t.Icon} unlocked={lit} groupId={t.groupId} />}
      title={t.identity}
      subtitle={`${t.levelLabel} · ${t.levelName}`}
      from={item.from}
      to={item.to}
      target={item.target}
      celebrate={item.unlocked}
      chipText={`${t.levelLabel} upplåst!`}
      footer={left <= 2 ? `Bara ${left} kvar till ${t.levelLabel}!` : `${left} kvar till ${t.levelLabel} · ${t.requirementText}`}
      footerHot={left <= 2}
      afterUnlock={item.next ? `Nästa: ${item.next.levelLabel} · ${item.next.requirementText}` : null}
      timing={timing}
      skip={skip}
      onBox={onBox}
    />
  );
}

// ─── En rad med en stapel ──────────────────────────────────────────────────────
function ProgressRow({
  leading, title, subtitle, from, to, target, celebrate, chipText, footer, footerHot, afterUnlock, timing, skip, onBox,
}: {
  /** Ikonen/medaljen till vänster — `lit` blir sant när nivån klarats */
  leading: (lit: boolean) => ReactNode;
  title: string;
  subtitle: string;
  from: number;
  to: number;
  target: number;
  /** Besöket klarade målet — blixt, konfetti och guldbricka när stapeln når fram */
  celebrate: boolean;
  chipText: string;
  /** Texten under stapeln när målet inte klarades */
  footer: string;
  /** Nära målet: texten lyser guld */
  footerHot: boolean;
  /** Texten bredvid guldbrickan när målet klarats (nästa mål) */
  afterUnlock: string | null;
  timing: RowTiming;
  skip: boolean;
  onBox: (b: Box) => void;
}) {
  const reduceMotion = useReducedMotion();
  const instant = skip || reduceMotion;
  const end = Math.min(to, target);
  const [count, setCount] = useState(from);
  const [lit, setLit] = useState(false);
  const inV = useSharedValue(0);
  const plus = useSharedValue(0);
  const unlock = useSharedValue(0);
  const pop = useSharedValue(0);
  const burst = useSharedValue(0);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (instant) {
      inV.value = 1;
      plus.value = 1;
      setCount(end);
      if (celebrate) {
        unlock.value = 1;
        setLit(true);
      }
      return;
    }
    inV.value = withDelay(timing.appearAt, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    return () => { if (successTimer.current) clearTimeout(successTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant]);

  // Stapeln når fram: siffran byts och "+1" poppar — och klarades målet: konfetti ur medaljen,
  // guldkant, brickan och nästa mål
  const onFull = () => {
    setCount(end);
    plus.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.back(2)) });
    playSound("tick");
    if (!celebrate) return;
    // Strax efter stapelns duns, så de två inte flyter ihop till en
    successTimer.current = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 130);
    playSound("milestone");
    setLit(true);
    unlock.value = withTiming(1, { duration: 450 });
    pop.value = withSequence(
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) }),
    );
    burst.value = withTiming(1, { duration: 1100, easing: Easing.linear });
  };

  const cardStyle = useAnimatedStyle(() => ({
    opacity: inV.value,
    transform: [{ translateY: interpolate(inV.value, [0, 1], [22, 0]) }],
    borderColor: interpolateColor(unlock.value, [0, 1], ["rgba(255,255,255,0.08)", "rgba(233,196,106,0.75)"]),
  }));
  const leadingStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.3 }] }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: plus.value,
    transform: [{ scale: interpolate(plus.value, [0, 1], [0.4, 1]) }],
  }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: unlock.value,
    transform: [{ scale: interpolate(unlock.value, [0, 1], [0.7, 1]) }],
  }));

  return (
    <Reanimated.View
      style={[s.card, cardStyle]}
      onLayout={(e) => onBox({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
    >
      <View style={s.cardTop}>
        <Reanimated.View style={[s.leading, leadingStyle]}>
          {leading(lit)}
          {celebrate && <Confetti progress={burst} count={18} power={0.55} durationS={1} />}
        </Reanimated.View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.cardSub} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Reanimated.View style={[s.plusSmall, plusStyle]}>
          <Text style={s.plusSmallText}>+{to - from}</Text>
        </Reanimated.View>
        <View style={s.countWrap}>
          <FlipNumber value={count} style={s.count} animate={!instant} />
          <Text style={s.countOf}> / {target}</Text>
        </View>
      </View>

      <View style={s.barWrap}>
        <FillBar
          from={target > 0 ? from / target : 0}
          to={target > 0 ? end / target : 0}
          startAt={timing.fillAt}
          durationMs={FILL_MS}
          skip={skip}
          celebrate={celebrate}
          onFull={onFull}
        />
      </View>

      {celebrate ? (
        <Reanimated.View style={[s.unlockRow, chipStyle]}>
          <View style={s.unlockChip}>
            <Text style={s.unlockText}>{chipText}</Text>
          </View>
          {afterUnlock && <Text style={s.nextGoal} numberOfLines={1}>{afterUnlock}</Text>}
        </Reanimated.View>
      ) : (
        <Text style={[s.footer, footerHot && s.footerHot]} numberOfLines={1}>{footer}</Text>
      )}
    </Reanimated.View>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 20 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 2.4, color: MUTED, textAlign: "center" },

  hero: { alignItems: "center", marginTop: 6 },
  heroRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  heroNumber: {
    fontFamily: "Montserrat_700Bold", fontSize: 84, lineHeight: 96, color: GOLD,
    textShadowColor: "rgba(233,196,106,0.55)", textShadowRadius: 22, textShadowOffset: { width: 0, height: 0 },
  },
  plusBadge: {
    marginLeft: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: "rgba(74,222,128,0.16)", borderWidth: 1, borderColor: "rgba(74,222,128,0.5)",
  },
  plusText: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: GREEN },
  heroLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: MUTED, marginTop: -4 },
  pctPill: {
    flexDirection: "row", alignItems: "center", marginTop: 10, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, backgroundColor: "rgba(233,196,106,0.10)", borderWidth: 1, borderColor: "rgba(233,196,106,0.30)",
  },
  pctValue: { fontFamily: "Montserrat_700Bold", fontSize: 13.5, color: GOLD, fontVariant: ["tabular-nums"] },
  pctLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(245,241,232,0.75)" },
  milestoneChip: {
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(233,196,106,0.16)", borderWidth: 1, borderColor: "rgba(233,196,106,0.6)",
  },
  milestoneText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: GOLD },

  rows: { gap: 10, marginTop: 22 },
  card: {
    backgroundColor: CARD, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  leading: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  catIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: FG },
  cardSub: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: MUTED, marginTop: 2 },
  countWrap: { flexDirection: "row", alignItems: "flex-end" },
  count: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: FG, fontVariant: ["tabular-nums"] },
  countOf: { fontFamily: "Inter_500Medium", fontSize: 13, color: MUTED, marginBottom: 2 },
  plusSmall: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: "rgba(74,222,128,0.16)",
  },
  plusSmallText: { fontFamily: "Montserrat_700Bold", fontSize: 12.5, color: GREEN },
  barWrap: { marginTop: 12 },
  footer: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: MUTED, marginTop: 8 },
  footerHot: { fontFamily: "Inter_600SemiBold", color: GOLD },
  unlockRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  unlockChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
    backgroundColor: "rgba(233,196,106,0.18)", borderWidth: 1, borderColor: "rgba(233,196,106,0.6)",
  },
  unlockText: { fontFamily: "Inter_700Bold", fontSize: 13, color: GOLD },
  nextGoal: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12.5, color: "rgba(245,241,232,0.75)" },
});
