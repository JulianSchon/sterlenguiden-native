/**
 * Admin: förfrågningar om att ta hand om en plats (när koden inte gick att skicka) och ansökningar
 * från företag som inte finns i appen. Bara den som har rollen admin ser sidan (databasen kollar).
 *
 * Varje kort visar vem som frågar (namn, e-post — med Mejla), vilken plats, och om någon redan
 * sköter den. Beviset är ett mejl från företagets egen adress till hej@osterlenappen.se: godkänn
 * först när det kommit. Godkänn = personen blir ägare (för en ny plats skapas den först, utan
 * läge på kartan: lägg in lat/lng i Supabase efteråt). Personen får ett mejl om svaret.
 */
import { useState } from "react";
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { AlertTriangle, Inbox, Mail, Phone } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { Note, SectionHeader } from "@/components/business/PortalParts";
import { useAdminRequests, useDecideRequest } from "@/hooks/useBusiness";
import { businessError, type AdminRequest } from "@/lib/business";
import { pushOnce } from "@/lib/navigateOnce";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function AdminScreen() {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { data, error } = useAdminRequests();
  const pending = (data ?? []).filter((r) => r.status === "pending");
  const decided = (data ?? []).filter((r) => r.status !== "pending");

  return (
    <SettingsScreen title="Admin">
      {error ? (
        <Text style={s.error}>{businessError(error)}</Text>
      ) : !data ? (
        <><Skeleton height={220} radius={22} /><Skeleton height={220} radius={22} /></>
      ) : (
        <>
          <Rise index={0}>
            <View>
              <SectionHeader title={pending.length ? `Väntar på dig · ${pending.length}` : "Väntar på dig"} />
              {pending.length === 0 ? (
                <View style={s.empty}>
                  <Inbox size={26} color={colors.faint} strokeWidth={1.7} />
                  <Text style={s.emptyText}>Inget som väntar. Nya förfrågningar kommer också som mejl.</Text>
                </View>
              ) : (
                <View style={{ gap: 14 }}>{pending.map((r) => <RequestCard key={r.id} request={r} />)}</View>
              )}
            </View>
          </Rise>
          {decided.length > 0 && (
            <Rise index={1}>
              <View>
                <SectionHeader title="Senaste 30 dagarna" />
                <GradientCard>
                  {decided.map((r, i) => (
                    <View key={r.id} style={[s.done, i > 0 && s.border]}>
                      <Text style={s.doneName} numberOfLines={1}>{r.place?.name ?? r.new_place?.name ?? "Plats"}</Text>
                      <Text style={[s.doneStatus, { color: r.status === "approved" ? colors.success : colors.muted }]}>
                        {r.status === "approved" ? "Godkänd" : r.status === "rejected" ? "Nekad" : "Återtagen"}
                      </Text>
                    </View>
                  ))}
                </GradientCard>
              </View>
            </Rise>
          )}
          <Rise index={2}>
            <Note text="Godkänn först när ett mejl kommit från företagets egen e-post. Då blir personen ägare till platsen och får ett mejl." />
          </Rise>
        </>
      )}
    </SettingsScreen>
  );
}

function RequestCard({ request: r }: { request: AdminRequest }) {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const decide = useDecideRequest();
  const [busy, setBusy] = useState(false);
  const isNew = r.kind === "new_place";
  const title = isNew ? r.new_place?.name ?? "Nytt företag" : r.place?.name ?? "Plats";

  const run = (approve: boolean) => {
    const go = async () => {
      setBusy(true);
      try {
        const res = await decide(r.id, approve);
        if (!res.ok) Alert.alert("Redan avgjord", "Någon har redan svarat på den här.");
      } catch (e) {
        Alert.alert("Det gick inte", businessError(e));
      } finally {
        setBusy(false);
      }
    };
    if (approve) {
      Alert.alert(isNew ? `Lägga till ${title}?` : `Godkänna ${r.user.name ?? "personen"}?`,
        isNew ? "Platsen skapas och personen blir ägare. Lägg sedan in platsens läge i Supabase." : `${r.user.name ?? "Personen"} blir ägare till ${title}.`,
        [{ text: "Avbryt", style: "cancel" }, { text: "Godkänn", onPress: go }]);
    } else {
      Alert.alert("Neka?", "Personen får ett vänligt mejl om att det inte gick.", [{ text: "Avbryt", style: "cancel" }, { text: "Neka", style: "destructive", onPress: go }]);
    }
  };

  return (
    <GradientCard borderColor={r.owners > 0 ? colors.danger : undefined}>
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={[s.kind, isNew && { color: colors.goldText, backgroundColor: colors.goldSoft }]}>{isNew ? "Nytt företag" : "Ta hand om"}</Text>
          <Text style={s.when}>{format(new Date(r.created_at), "d MMM HH:mm", { locale: sv })}</Text>
        </View>
        <TouchableOpacity disabled={!r.place} onPress={() => r.place && pushOnce(router, `/place/${r.place.id}`)}>
          <Text style={s.title}>{title}</Text>
        </TouchableOpacity>
        <Text style={s.sub}>
          {isNew ? [r.new_place?.town, r.new_place?.category, r.new_place?.website].filter(Boolean).join(" · ") : [r.place?.town, r.place?.email ? `e-post: ${r.place.email}` : "ingen e-post"].filter(Boolean).join(" · ")}
        </Text>
        {r.owners > 0 && (
          <View style={s.warn}>
            <AlertTriangle size={15} color={colors.danger} strokeWidth={2.2} />
            <Text style={[s.warnText, { color: colors.danger }]}>Platsen har redan {r.owners === 1 ? "en ägare" : `${r.owners} ägare`}.</Text>
          </View>
        )}

        <View style={s.who}>
          <Text style={s.whoName}>{r.user.name ?? "Utan namn"}{r.role_title ? ` · ${r.role_title}` : ""}</Text>
          <Text style={s.whoSub}>{[r.user.username ? `@${r.user.username}` : null, r.user.email, `konto sedan ${format(new Date(r.user.since), "d MMM yyyy", { locale: sv })}`].filter(Boolean).join(" · ")}</Text>
          {r.message && <Text style={s.message}>”{r.message}”</Text>}
          <View style={s.contact}>
            {r.phone && (
              <TouchableOpacity style={s.contactBtn} onPress={() => Linking.openURL(`tel:${r.phone!.replace(/[^\d+]/g, "")}`).catch(() => {})}>
                <Phone size={15} color={colors.text} strokeWidth={2} />
                <Text style={s.contactText}>{r.phone}</Text>
              </TouchableOpacity>
            )}
            {r.user.email && (
              <TouchableOpacity style={s.contactBtn} onPress={() => Linking.openURL(`mailto:${r.user.email}`).catch(() => {})}>
                <Mail size={15} color={colors.text} strokeWidth={2} />
                <Text style={s.contactText}>Mejla</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={s.buttons}>
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.gold }]} disabled={busy} onPress={() => run(true)}>
            <Text style={[s.btnText, { color: colors.onGold }]}>Godkänn</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={() => run(false)}>
            <Text style={s.btnText}>Neka</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GradientCard>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  error: { fontFamily: "Inter_500Medium", fontSize: 14, color: c.danger, textAlign: "center", marginTop: 20 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 24 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.muted, textAlign: "center", paddingHorizontal: 20 },
  card: { padding: 16, gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kind: {
    fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: c.muted,
    backgroundColor: c.fill, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, overflow: "hidden",
  },
  when: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: c.faint },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: c.text, marginTop: 4 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13.5, color: c.muted },
  warn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  warnText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5 },
  who: { marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, gap: 4 },
  whoName: { fontFamily: "Inter_700Bold", fontSize: 15, color: c.text },
  whoSub: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, color: c.muted },
  message: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.text, fontStyle: "italic", marginTop: 4 },
  contact: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  contactBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  contactText: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.text },
  buttons: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
  btnText: { fontFamily: "Inter_700Bold", fontSize: 14.5, color: c.text },
  done: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  doneName: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.text },
  doneStatus: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});
