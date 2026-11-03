/**
 * Inlösta erbjudanden: varje gång en medlem aktiverat ett av era erbjudanden — tid, namn och vilket
 * erbjudande, senaste först. Hämtas om var 15:e sekund medan sidan är öppen, så kassan eller
 * receptionen kan dubbelkolla att en aktivering är äkta (samma namn och tid som på medlemmens
 * skärm). En aktivering som pågår just nu (inom 60 sekunder) märks "Aktivt nu".
 */
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BadgeCheck, ShieldCheck } from "lucide-react-native";
import { isToday } from "date-fns";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { AuthButton } from "@/components/auth/AuthParts";
import { Note } from "@/components/business/PortalParts";
import { usePortalPlace, useRedemptions, type Redemption } from "@/hooks/useBusiness";
import { businessError } from "@/lib/business";
import { ACTIVE_SECS } from "@/lib/offers";
import { formatDate } from "@/i18n/dates";
import { currentLanguage } from "@/i18n";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import { tb } from "@/i18n/business";

export default function BusinessRedemptions() {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const query = useRedemptions(placeId);
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const today = query.data?.pages[0]?.today ?? 0;

  return (
    <SettingsScreen title={tb("Inlösta erbjudanden")}>
      <Rise index={0}>
        <Note icon={ShieldCheck} text={tb("Här syns varje gång en medlem använder ett av era erbjudanden, direkt när det händer. Jämför namnet och tiden med medlemmens skärm om ni vill dubbelkolla.")} />
      </Rise>

      {query.error ? (
        <Text style={s.error}>{businessError(query.error)}</Text>
      ) : !query.data ? (
        <View style={{ gap: 10 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={68} radius={16} />)}
        </View>
      ) : items.length === 0 ? (
        <Rise index={1}>
          <View style={s.empty}>
            <View style={s.emptyIcon}><BadgeCheck size={28} color={colors.goldText} strokeWidth={1.8} /></View>
            <Text style={s.emptyTitle}>{tb("Inga inlösta erbjudanden än")}</Text>
            <Text style={s.emptyText}>{tb("När en medlem använder ett av era erbjudanden syns det här.")}</Text>
          </View>
        </Rise>
      ) : (
        <Rise index={1}>
          <View style={{ gap: 10 }}>
            <Text style={s.count}>{tb(today === 1 ? "1 i dag" : "{{0}} i dag", { 0: today })}</Text>
            {items.map((r) => <Row key={r.id} r={r} />)}
            {query.hasNextPage && (
              <AuthButton label={tb("Visa fler")} variant="outline" loading={query.isFetchingNextPage} onPress={() => query.fetchNextPage()} />
            )}
          </View>
        </Rise>
      )}
    </SettingsScreen>
  );
}

function Row({ r }: { r: Redemption }) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const at = new Date(r.at);
  const active = Date.now() - at.getTime() < ACTIVE_SECS * 1000;
  const lng = currentLanguage();
  return (
    <View style={[s.row, active && { borderColor: colors.success }]}>
      <View style={s.time}>
        <Text style={s.clock}>{formatDate(at, "HH:mm", lng)}</Text>
        <Text style={s.day}>{isToday(at) ? tb("i dag") : formatDate(at, "d MMM", lng)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{r.name ?? tb("Medlem")}</Text>
        <Text style={s.offer} numberOfLines={2}>{r.offer}</Text>
      </View>
      {active && <Text style={[s.live, { color: colors.success }]}>{tb("Aktivt nu")}</Text>}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  error: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.danger },
  count: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: c.muted, letterSpacing: 0.3 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 16, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  time: { width: 52, alignItems: "flex-start" },
  clock: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: c.text, fontVariant: ["tabular-nums"] },
  day: { fontFamily: "Inter_400Regular", fontSize: 12, color: c.muted, marginTop: 1 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  offer: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 2 },
  live: { fontFamily: "Inter_700Bold", fontSize: 11.5, letterSpacing: 0.4 },
  empty: { alignItems: "center", paddingVertical: 28, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: c.goldSoft },
  emptyTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: c.text },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: c.muted, textAlign: "center", paddingHorizontal: 16 },
});
