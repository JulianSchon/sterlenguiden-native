/**
 * Personal: vilka som sköter platsen, inbjudningar som väntar, förfrågningar om att få gå med och
 * de senaste ändringarna ("Anna ändrade öppettiderna · i går").
 *
 * Man bjuder in med e-post: personen loggar in i Österlenappen med den adressen, och då väntar
 * inbjudan under Inställningar. Ägare kan bjuda in, byta roll och ta bort; personal kan ändra allt
 * på sidan men inte vilka som har tillgång.
 *
 * Ägaren väljer vad var och en i personalen får göra: stories, evenemang, erbjudanden och att ändra
 * sidan. Ny personal får allt utom erbjudanden (de påverkar kassan). Databasen kontrollerar det.
 */
import { useRef, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { formatDistanceToNowStrict } from "date-fns";
import { sv } from "date-fns/locale";
import { Mail, UserPlus, Users } from "lucide-react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { Sheet, PrimaryButton } from "@/components/Sheet";
import { Note, PortalField, PortalSegmented, PortalToast, SectionHeader, type PortalToastHandle } from "@/components/business/PortalParts";
import { useTeam, useTeamActions, usePortalPlace } from "@/hooks/useBusiness";
import { DEFAULT_PERMISSIONS, PERMISSIONS, businessError, isEmail, type MemberRole, type Permission, type TeamMember } from "@/lib/business";
import { IconSwitch } from "@/components/IconSwitch";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

const WHAT: Record<string, string> = {
  hours: "ändrade öppettiderna", exceptions: "ändrade tillfälliga öppettider", about: "ändrade texten om er",
  contact: "ändrade kontaktuppgifterna", photos: "ändrade bilderna", categories: "ändrade kategorierna",
  amenities: "ändrade vad som finns", settings: "ändrade inställningarna", offer: "ändrade ett erbjudande",
  event: "ändrade ett evenemang", story: "lade upp en story", team: "ändrade personalen",
  claimed: "tog hand om sidan", joined: "gick med",
};

const ago = (iso: string) => formatDistanceToNowStrict(new Date(iso), { locale: sv, addSuffix: true });

export default function BusinessTeam() {
  const router = useRouter();
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { placeId, mine } = usePortalPlace();
  const { data: team } = useTeam(placeId);
  const actions = useTeamActions(placeId);
  const toast = useRef<PortalToastHandle>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("staff");
  const [perms, setPerms] = useState<Permission[]>(DEFAULT_PERMISSIONS);
  // Personen vars behörigheter ägaren ändrar just nu
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editPerms, setEditPerms] = useState<Permission[]>([]);
  const [busy, setBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const owner = mine?.role === "owner";

  const sendInvite = async () => {
    setBusy(true);
    setInviteError(null);
    try {
      const r = await actions.invite(email.trim(), role, role === "staff" ? perms : null);
      if (!r.ok) {
        setInviteError(r.reason === "already_member" ? "Den personen är redan med." : r.reason === "invalid_email" ? "E-postadressen ser inte rätt ut." : r.reason === "too_many" ? "Ni har många inbjudningar som väntar. Ta bort några först." : "Det gick inte.");
        return;
      }
      setInviteOpen(false);
      setEmail("");
      setPerms(DEFAULT_PERMISSIONS);
      setTimeout(() => toast.current?.show(r.emailed ? "Inbjudan skickad" : "Inbjudan sparad – be personen logga in med den adressen"), 300);
    } catch (e) {
      setInviteError(businessError(e));
    } finally {
      setBusy(false);
    }
  };

  const result = (p: Promise<{ ok: boolean; reason?: string }>, done: string) =>
    p.then((r) => toast.current?.show(r.ok ? done : r.reason === "last_owner" ? "Det måste finnas minst en ägare" : "Det gick inte"))
      .catch((e) => toast.current?.show(businessError(e)));

  const memberMenu = (m: TeamMember) => {
    const items: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (m.me) {
      items.push({
        label: "Lämna företaget", destructive: true,
        onPress: () => Alert.alert(`Lämna ${mine?.name}?`, "Du kan inte längre ändra sidan. Någon behöver bjuda in dig igen för att komma tillbaka.", [
          { text: "Avbryt", style: "cancel" },
          {
            text: "Lämna", style: "destructive",
            onPress: () => actions.remove(m.user_id).then((r) => {
              if (r.ok) router.dismissTo("/settings" as never);
              else toast.current?.show(r.reason === "last_owner" ? "Gör någon annan till ägare först" : "Det gick inte");
            }).catch((e) => toast.current?.show(businessError(e))),
          },
        ]),
      });
    } else if (owner) {
      if (m.role === "staff") {
        items.push({ label: "Vad får hen göra?", onPress: () => { setEditPerms(m.permissions ?? PERMISSIONS.map((p) => p.id)); setEditing(m); } });
      }
      items.push(m.role === "owner"
        ? { label: "Gör till personal", onPress: () => result(actions.setRole(m.user_id, "staff"), "Nu personal") }
        : { label: "Gör till ägare", onPress: () => result(actions.setRole(m.user_id, "owner"), "Nu ägare") });
      items.push({
        label: "Ta bort från företaget", destructive: true,
        onPress: () => Alert.alert(`Ta bort ${m.name ?? "personen"}?`, "Hen kan inte längre ändra er sida.", [
          { text: "Avbryt", style: "cancel" },
          { text: "Ta bort", style: "destructive", onPress: () => result(actions.remove(m.user_id), "Borttagen") },
        ]),
      });
    }
    if (items.length === 0) return;
    if (Platform.OS === "ios") {
      const options = [...items.map((i) => i.label), "Avbryt"];
      ActionSheetIOS.showActionSheetWithOptions(
        { title: m.name ?? undefined, options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: items.findIndex((i) => i.destructive) },
        (n) => items[n]?.onPress(),
      );
    } else {
      Alert.alert(m.name ?? "", undefined, [...items.map((i) => ({ text: i.label, style: i.destructive ? "destructive" as const : "default" as const, onPress: i.onPress })), { text: "Avbryt", style: "cancel" }]);
    }
  };

  return (
    <>
      <SettingsScreen title="Personal">
        {!team ? (
          <><Skeleton height={140} radius={22} /><Skeleton height={90} radius={22} /></>
        ) : (
          <>
            {team.requests.length > 0 && owner && (
              <Rise index={0}>
                <View>
                  <SectionHeader title="Vill gå med" />
                  <GradientCard borderColor={colors.goldBorder}>
                    {team.requests.map((r, i) => (
                      <View key={r.id} style={[s.request, i > 0 && s.border]}>
                        <Text style={s.requestName}>{r.name ?? "Någon"}{r.role_title ? ` · ${r.role_title}` : ""}</Text>
                        {r.message && <Text style={s.requestMsg}>”{r.message}”</Text>}
                        <View style={s.requestButtons}>
                          <TouchableOpacity style={[s.reqBtn, { backgroundColor: colors.gold }]} onPress={() => result(actions.answerJoin(r.id, true), `${r.name ?? "Personen"} är med`)}>
                            <Text style={[s.reqBtnText, { color: colors.onGold }]}>Godkänn</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.reqBtn} onPress={() => result(actions.answerJoin(r.id, false), "Nekad")}>
                            <Text style={s.reqBtnText}>Neka</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </GradientCard>
                </View>
              </Rise>
            )}

            <Rise index={1}>
              <View>
                <SectionHeader title={`Sköter ${mine?.name ?? "sidan"}`} />
                <GradientCard>
                  {team.members.map((m, i) => (
                    <Pressable key={m.user_id} onPress={() => memberMenu(m)} style={({ pressed }) => [s.member, i > 0 && s.border, pressed && { backgroundColor: colors.fill }]}>
                      <View style={[s.avatar, { backgroundColor: m.color ?? colors.tile }]}>
                        <Text style={s.avatarText}>{(m.name ?? "?").slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.memberName}>{m.name ?? "Utan namn"}{m.me ? " (du)" : ""}</Text>
                        {m.role === "staff" ? (
                          <Text style={s.memberSub} numberOfLines={1}>{permissionSummary(m.permissions)}</Text>
                        ) : m.username ? <Text style={s.memberSub}>@{m.username}</Text> : null}
                      </View>
                      <Text style={[s.role, m.role === "owner" && { color: colors.goldText, backgroundColor: colors.goldSoft }]}>
                        {m.role === "owner" ? "Ägare" : "Personal"}
                      </Text>
                    </Pressable>
                  ))}
                </GradientCard>
              </View>
            </Rise>

            {team.invites.length > 0 && (
              <Rise index={2}>
                <View>
                  <SectionHeader title="Inbjudna" />
                  <GradientCard>
                    {team.invites.map((inv, i) => (
                      <View key={inv.id} style={[s.member, i > 0 && s.border]}>
                        <Mail size={18} color={colors.muted} strokeWidth={2} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.memberName} numberOfLines={1}>{inv.email}</Text>
                          <Text style={s.memberSub}>{inv.role === "owner" ? "Ägare" : "Personal"} · inbjuden {ago(inv.created_at)}</Text>
                        </View>
                        {owner && (
                          <TouchableOpacity hitSlop={8} onPress={() => result(actions.cancelInvite(inv.id).then(() => ({ ok: true })), "Inbjudan borttagen")}>
                            <Text style={s.remove}>Ta bort</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </GradientCard>
                </View>
              </Rise>
            )}

            {owner && (
              <Rise index={3}>
                <TouchableOpacity style={s.inviteBtn} activeOpacity={0.8} onPress={() => { setInviteError(null); setInviteOpen(true); }}>
                  <UserPlus size={19} color={colors.goldText} strokeWidth={2} />
                  <Text style={s.inviteText}>Bjud in någon</Text>
                </TouchableOpacity>
              </Rise>
            )}

            <Rise index={4}>
              <Note icon={Users} text="Ägare kan allt och väljer vad var och en i personalen får göra – tryck på en person för att ändra. Ny personal får allt utom erbjudanden." />
            </Rise>

            {team.changes.length > 0 && (
              <Rise index={5}>
                <View>
                  <SectionHeader title="Senaste ändringarna" />
                  <GradientCard>
                    {team.changes.map((c, i) => (
                      <View key={`${c.what}-${c.at}`} style={[s.change, i > 0 && s.border]}>
                        <Text style={s.changeText}><Text style={s.changeName}>{c.name ?? "Någon"}</Text> {WHAT[c.what] ?? "ändrade sidan"}</Text>
                        <Text style={s.changeAt}>{ago(c.at)}</Text>
                      </View>
                    ))}
                  </GradientCard>
                </View>
              </Rise>
            )}
          </>
        )}
      </SettingsScreen>

      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Bjud in någon">
        <View style={{ gap: 16 }}>
          <PortalField
            label="E-post"
            icon={Mail}
            value={email}
            onChangeText={(v) => { setEmail(v); setInviteError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="namn@exempel.se"
            error={inviteError}
            help="Personen loggar in i Österlenappen med den här adressen – då väntar inbjudan där."
          />
          <PortalSegmented options={[{ id: "staff", label: "Personal" }, { id: "owner", label: "Ägare" }]} value={role} onChange={setRole} />
          {role === "staff" ? (
            <PermissionToggles value={perms} onChange={setPerms} />
          ) : (
            <Text style={s.ownerNote}>En ägare kan göra allt, även bjuda in och ta bort personal.</Text>
          )}
        </View>
        <PrimaryButton label="Skicka inbjudan" onPress={sendInvite} loading={busy} disabled={!isEmail(email)} />
      </Sheet>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? `Vad får ${editing.name ?? "hen"} göra?` : ""}>
        <PermissionToggles value={editPerms} onChange={setEditPerms} />
        <PrimaryButton
          label="Spara"
          onPress={() => {
            const who = editing;
            setEditing(null);
            if (who) result(actions.setPermissions(who.user_id, editPerms), "Sparat");
          }}
        />
      </Sheet>
      <PortalToast ref={toast} />
    </>
  );
}

/** "Stories, evenemang och sidan" — vad någon i personalen får göra */
function permissionSummary(perms: Permission[] | null | undefined): string {
  if (!perms) return "Får göra allt";
  if (perms.length === 0) return "Får bara titta";
  const names: Record<Permission, string> = { stories: "stories", events: "evenemang", offers: "erbjudanden", info: "ändra sidan" };
  const list = PERMISSIONS.filter((p) => perms.includes(p.id)).map((p) => names[p.id]);
  const text = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} och ${list[list.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Ett reglage per sak personen får göra */
function PermissionToggles({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.perms}>
      {PERMISSIONS.map((p) => {
        const on = value.includes(p.id);
        return (
          <View key={p.id} style={s.permRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.permLabel}>{p.label}</Text>
              <Text style={s.permHelp}>{p.help}</Text>
            </View>
            <IconSwitch value={on} onChange={(v) => onChange(v ? [...value, p.id] : value.filter((x) => x !== p.id))} />
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  request: { padding: 16, gap: 6 },
  requestName: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: c.text },
  requestMsg: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted, fontStyle: "italic" },
  requestButtons: { flexDirection: "row", gap: 10, marginTop: 6 },
  reqBtn: { flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong },
  reqBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: c.text },
  member: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: "#FFFFFF" },
  memberName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  memberSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: c.muted, marginTop: 1 },
  role: {
    fontFamily: "Inter_700Bold", fontSize: 11.5, color: c.muted, backgroundColor: c.fill,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, overflow: "hidden",
  },
  remove: { fontFamily: "Inter_600SemiBold", fontSize: 13.5, color: c.danger },
  inviteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 16,
    borderWidth: 1.5, borderStyle: "dashed", borderColor: c.goldBorder, backgroundColor: c.goldSoft,
  },
  inviteText: { fontFamily: "Inter_700Bold", fontSize: 15, color: c.goldText },
  change: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  ownerNote: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, color: c.muted },
  perms: { gap: 14, marginBottom: 6 },
  permRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  permLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: c.text },
  permHelp: { fontFamily: "Inter_400Regular", fontSize: 12.5, lineHeight: 17, color: c.muted, marginTop: 2 },
  changeText: { fontFamily: "Inter_400Regular", fontSize: 14, color: c.text },
  changeName: { fontFamily: "Inter_600SemiBold" },
  changeAt: { fontFamily: "Inter_400Regular", fontSize: 12.5, color: c.muted },
});
