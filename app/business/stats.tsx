/**
 * Statistik. Först en mening ("23 personer tittade på er sida") och kurvan över tid, sedan rutorna
 * (visningar, klick, vägbeskrivningar, nya favoriter, incheckningar, använda erbjudanden,
 * berättelsevisningar — alla jämförda med perioden innan), vilka knappar gästerna trycker på, hur
 * de hittade er och vilka som tittar.
 *
 * Inget visar vem: bara antal. Ålder och hemort syns först när minst 20 personer tittat, och
 * grupper med färre än 5 personer visas inte alls (databasen räknar så, business_stats).
 */
import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from "react-native-svg";
import { ShieldCheck } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { Note, PortalSegmented, SectionHeader } from "@/components/business/PortalParts";
import { useBusinessStats, usePortalPlace } from "@/hooks/useBusiness";
import { businessError, type BusinessStats } from "@/lib/business";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

type Days = 7 | 30 | 365;

const LINKS: { key: string; label: string }[] = [
  { key: "phone", label: "Ring" }, { key: "website", label: "Hemsida" }, { key: "book", label: "Boka" },
  { key: "instagram", label: "Instagram" }, { key: "facebook", label: "Facebook" }, { key: "email", label: "E-post" },
];
const SOURCES: Record<string, string> = {
  home: "Hem", search: "Sök", map: "Kartan", calendar: "Kalendern", profile: "Profil", category: "Kategorier",
  lists: "Listor och favoriter", place: "Platser i närheten", offers: "Förmåner", story: "Stories", friends: "Vänner",
  event: "Evenemang", discover: "Upptäck", news: "Nyheter", checkin: "Incheckning", other: "Övrigt",
};
const AGES: { key: string; label: string }[] = [
  { key: "under25", label: "Under 25" }, { key: "25-34", label: "25–34" }, { key: "35-44", label: "35–44" },
  { key: "45-54", label: "45–54" }, { key: "55-64", label: "55–64" }, { key: "65plus", label: "65+" },
];
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const PERIOD: Record<Days, string> = { 7: "veckan", 30: "månaden", 365: "året" };
const PREV: Record<Days, string> = { 7: "veckan innan", 30: "månaden innan", 365: "året innan" };

export default function BusinessStatsPage() {
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const [days, setDays] = useState<Days>(30);
  const { data, error, isLoading } = useBusinessStats(placeId, days);

  return (
    <SettingsScreen title="Statistik">
      <Rise index={0}>
        <PortalSegmented options={[{ id: 7, label: "7 dagar" }, { id: 30, label: "30 dagar" }, { id: 365, label: "12 månader" }]} value={days} onChange={setDays} />
      </Rise>
      {error ? (
        <Text style={s.error}>{businessError(error)}</Text>
      ) : isLoading || !data ? (
        <>
          <Skeleton height={230} radius={22} />
          <View style={{ flexDirection: "row", gap: 10 }}><Skeleton height={92} radius={18} style={{ flex: 1 }} /><Skeleton height={92} radius={18} style={{ flex: 1 }} /></View>
          <Skeleton height={180} radius={22} />
        </>
      ) : (
        <Content stats={data} days={days} />
      )}
    </SettingsScreen>
  );
}

function Content({ stats, days }: { stats: BusinessStats; days: Days }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const diff = stats.visitors - stats.visitors_prev;
  const linkMax = Math.max(1, ...LINKS.map((l) => stats.links[l.key] ?? 0));
  // Övrigt sist, oavsett hur stort
  const sources = Object.entries(stats.sources).sort((a, b) => (a[0] === "other" ? 1 : b[0] === "other" ? -1 : b[1] - a[1]));
  const sourceTotal = sources.reduce((n, [, v]) => n + v, 0);

  return (
    <>
      <Rise index={1}>
        <GradientCard>
          <View style={s.heroBody}>
            <Text style={s.heroN}>{stats.visitors.toLocaleString("sv-SE")}</Text>
            <Text style={s.heroText}>
              {stats.visitors === 1 ? "person" : "personer"} tittade på er sida {days === 7 ? "i veckan" : days === 30 ? "senaste 30 dagarna" : "senaste året"}
            </Text>
            {stats.visitors_prev > 0 && diff !== 0 && (
              <Text style={[s.heroDiff, { color: diff > 0 ? colors.success : colors.muted }]}>
                {diff > 0 ? `${diff} fler` : `${-diff} färre`} än {PREV[days]}
              </Text>
            )}
            <Chart series={stats.series} days={days} />
          </View>
        </GradientCard>
      </Rise>

      <Rise index={2}>
        <View style={s.tiles}>
          <Tile n={stats.views} prev={stats.views_prev} label="Visningar av er sida" />
          <Tile n={stats.clicks} prev={stats.clicks_prev} label="Tryck på era knappar" />
          <Tile n={stats.directions} prev={stats.directions_prev} label="Vägbeskrivningar" />
          <Tile n={stats.favorites_new} prev={stats.favorites_new_prev} label={`Nya favoriter (${stats.favorites_total} totalt)`} />
          <Tile n={stats.checkins} prev={stats.checkins_prev} label="Incheckningar hos er" />
          <Tile n={stats.redemptions} prev={stats.redemptions_prev} label="Använda erbjudanden" />
          <Tile n={stats.story_views} label="Visningar av stories" />
        </View>
      </Rise>

      <Rise index={3}>
        <View>
          <SectionHeader title="Vad gästerna trycker på" />
          <GradientCard>
            <View style={s.bars}>
              {LINKS.map((l) => (
                <Bar key={l.key} label={l.label} n={stats.links[l.key] ?? 0} max={linkMax} />
              ))}
            </View>
          </GradientCard>
        </View>
      </Rise>

      {sourceTotal > 0 && (
        <Rise index={4}>
          <View>
            <SectionHeader title="Så hittade de er" />
            <GradientCard>
              <View style={s.bars}>
                {sources.map(([key, n]) => (
                  <Bar key={key} label={SOURCES[key] ?? key} n={n} max={Math.max(...sources.map(([, v]) => v))} suffix={`${Math.round((n / sourceTotal) * 100)} %`} />
                ))}
              </View>
            </GradientCard>
          </View>
        </Rise>
      )}

      <Rise index={5}>
        <View>
          <SectionHeader title="Vilka tittar" />
          <GradientCard>
            {stats.audience ? (
              <View style={s.bars}>
                {(() => {
                  const max = Math.max(1, ...AGES.map((a) => stats.audience!.ages[a.key] ?? 0));
                  return AGES.filter((a) => stats.audience!.ages[a.key]).map((a) => (
                    <Bar key={a.key} label={a.label} n={stats.audience!.ages[a.key]} max={max} />
                  ));
                })()}
                {(stats.audience.local > 0 || stats.audience.visiting > 0) && (
                  <Text style={s.audienceLine}>
                    {stats.audience.local} bor på Österlen · {stats.audience.visiting} är här på besök
                  </Text>
                )}
                {stats.audience.towns.length > 0 && (
                  <Text style={s.audienceLine}>Flest från {stats.audience.towns.map((t) => t.town).join(", ")}</Text>
                )}
              </View>
            ) : (
              <View style={s.waiting}>
                <Text style={s.waitingText}>
                  Här ser ni ålder och var gästerna bor – men först när minst 20 olika personer tittat på er sida under perioden, så att ingen enskild går att känna igen. Hittills {stats.audience_people ?? 0} {stats.audience_people === 1 ? "person" : "personer"}.
                </Text>
              </View>
            )}
          </GradientCard>
        </View>
      </Rise>

      <Rise index={6}>
        <Note icon={ShieldCheck} text={`Vi visar aldrig vem som tittat – bara hur många. Siffrorna gäller ${PERIOD[days]} som gått och jämförs med ${PREV[days]}.`} />
      </Rise>
    </>
  );
}

function Tile({ n, prev, label }: { n: number; prev?: number; label: string }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const change = prev === undefined ? null : prev === 0 ? (n > 0 ? "Nytt" : null) : Math.round(((n - prev) / prev) * 100);
  return (
    <View style={s.tile}>
      <Text style={s.tileN}>{n.toLocaleString("sv-SE")}</Text>
      <Text style={s.tileLabel}>{label}</Text>
      {change !== null && change !== 0 && (
        <Text style={[s.tileChange, { color: typeof change === "string" || change > 0 ? colors.success : colors.muted }]}>
          {typeof change === "string" ? change : `${change > 0 ? "+" : "−"}${Math.abs(change)} %`}
        </Text>
      )}
    </View>
  );
}

function Bar({ label, n, max, suffix }: { label: string; n: number; max: number; suffix?: string }) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.max(n > 0 ? 4 : 0, (n / max) * 100)}%` }]} />
      </View>
      <Text style={s.barN}>{suffix ?? n}</Text>
    </View>
  );
}

/** Kurvan: visningar per dag (per månad för ett år), med den senaste punkten markerad */
function Chart({ series, days }: { series: BusinessStats["series"]; days: Days }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const W = width - 32 - 32;
  const H = 120;
  const pad = 6;
  if (series.length < 2) return null;
  const max = Math.max(1, ...series.map((p) => p.views));
  const x = (i: number) => pad + (i / (series.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const label = (d: string) => (days === 365 ? MONTHS[Number(d.slice(5, 7)) - 1] : `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`);
  const last = series[series.length - 1];
  return (
    <View style={{ marginTop: 18 }}>
      <View style={s.chartTop}>
        <Text style={s.chartMax}>{max}</Text>
        <Text style={s.chartCaption}>visningar per {days === 365 ? "månad" : "dag"}</Text>
      </View>
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="stats-area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.gold} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#stats-area)" />
        <Path d={line} stroke={colors.gold} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={x(series.length - 1)} cy={y(last.views)} r={4} fill={colors.gold} />
      </Svg>
      <View style={s.chartAxis}>
        <Text style={s.axisText}>{label(series[0].d)}</Text>
        <Text style={s.axisText}>{label(series[Math.floor(series.length / 2)].d)}</Text>
        <Text style={s.axisText}>{label(last.d)}</Text>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  error: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.danger, textAlign: "center", marginTop: 20 },
  heroBody: { padding: 16 },
  heroN: { fontFamily: "Montserrat_700Bold", fontSize: 40, letterSpacing: -1, color: c.text, fontVariant: ["tabular-nums"] },
  heroText: { fontFamily: "Inter_500Medium", fontSize: 15, lineHeight: 21, color: c.muted, marginTop: 2 },
  heroDiff: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 6 },
  chartTop: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 6 },
  chartMax: { fontFamily: "Inter_700Bold", fontSize: 12, color: c.muted, fontVariant: ["tabular-nums"] },
  chartCaption: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.faint },
  chartAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  axisText: { fontFamily: "Inter_500Medium", fontSize: 11.5, color: c.faint, fontVariant: ["tabular-nums"] },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "48.4%", padding: 14, borderRadius: 18, backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 2,
  },
  tileN: { fontFamily: "Montserrat_700Bold", fontSize: 24, color: c.text, fontVariant: ["tabular-nums"] },
  tileLabel: { fontFamily: "Inter_500Medium", fontSize: 12.5, lineHeight: 17, color: c.muted },
  tileChange: { fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 4 },
  bars: { padding: 16, gap: 12 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barLabel: { width: 104, fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.text },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: c.fill, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: c.gold },
  barN: { minWidth: 34, textAlign: "right", fontFamily: "Inter_700Bold", fontSize: 13, color: c.text, fontVariant: ["tabular-nums"] },
  audienceLine: { fontFamily: "Inter_500Medium", fontSize: 13.5, lineHeight: 19, color: c.muted, marginTop: 2 },
  waiting: { padding: 16 },
  waitingText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted },
});
