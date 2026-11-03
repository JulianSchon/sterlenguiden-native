/**
 * Ett kort i flödet på Hem som leder till det man själv skapat — så att man vill skapa mer:
 * - har man minnen: "Blicka tillbaka" till ett av dem (ett äldre, olika dag för dag),
 * - har man listor: "Fortsätt där du slutade" med listan man senast öppnade,
 * - har man båda: vartannat (efter dagen),
 * - har man inget av dem: en uppmaning att spara platser i en lista (skapas under Mitt Österlen).
 * Allt som står kommer från ens egen data.
 */
import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookHeart, ListPlus } from "lucide-react-native";
import { Image as ExpoImage } from "expo-image";
import { pushOnce } from "@/lib/navigateOnce";
import { useLists } from "@/hooks/useLists";
import { useMemories, useSignedUrls } from "@/hooks/useMemories";
import { daySeed } from "@/lib/homeFeed";
import { formatDate } from "@/i18n/dates";
import { imageSource } from "@/lib/imageSource";
import { useTheme } from "@/theme/ThemeProvider";

/** Ett minne räknas som att "blicka tillbaka" till först när det är minst så här gammalt */
const MEMORY_MIN_AGE_DAYS = 7;

type Pick =
  | { kind: "memory"; id: string; title: string; date: string; photo: string | null }
  | { kind: "list"; id: string; name: string; count: number; image: string | null }
  | { kind: "start" };

export const MineCard = memo(function MineCard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lists = useLists();
  const memories = useMemories();
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const pick = useMemo((): Pick | null => {
    if (!lists.isFetched || !memories.isFetched) return null;
    const seed = daySeed();
    const cutoff = Date.now() - MEMORY_MIN_AGE_DAYS * 86_400_000;
    const all = memories.data ?? [];
    const older = all.filter((m) => new Date(`${m.memoryDate}T12:00:00`).getTime() < cutoff);
    const pool = older.length > 0 ? older : all;
    const memory = pool.length > 0 ? pool[seed % pool.length] : null;
    // Listan man senast öppnade (annars den första)
    const list = [...(lists.data ?? [])].sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0] ?? null;
    const useMemory = memory && (!list || seed % 2 === 0);
    if (useMemory) return { kind: "memory", id: memory.id, title: memory.title, date: memory.memoryDate, photo: memory.photoPaths[0] ?? null };
    if (list) return { kind: "list", id: list.id, name: list.name, count: list.placeIds.length, image: list.coverImageUrl ?? list.images[0] ?? null };
    return { kind: "start" };
  }, [lists.isFetched, lists.data, memories.isFetched, memories.data]);

  const photoPaths = useMemo(() => (pick?.kind === "memory" && pick.photo ? [pick.photo] : []), [pick]);
  const { data: urls } = useSignedUrls(photoPaths);

  if (!pick) return null;

  const image = pick.kind === "memory" ? (pick.photo ? urls?.[pick.photo] ?? null : null) : pick.kind === "list" ? pick.image : null;
  const text = pick.kind === "memory"
    ? { eyebrow: t("home.mine.memoryEyebrow"), title: pick.title, sub: formatDate(pick.date, "d MMMM yyyy"), cta: t("home.mine.memoryCta") }
    : pick.kind === "list"
      ? { eyebrow: t("home.mine.listEyebrow"), title: pick.name, sub: t(pick.count === 1 ? "home.mine.placesOne" : "home.mine.placesOther", { count: pick.count }), cta: t("home.mine.listCta") }
      : { eyebrow: t("home.mine.startEyebrow"), title: t("home.mine.startTitle"), sub: t("home.mine.startSub"), cta: t("home.mine.startCta") };
  const Icon = pick.kind === "memory" ? BookHeart : ListPlus;

  const open = () => {
    if (pick.kind === "memory") pushOnce(router, { pathname: "/memories/[id]", params: { id: pick.id } });
    else if (pick.kind === "list") pushOnce(router, `/lists/${pick.id}`);
    else pushOnce(router, "/mitt-osterlen");
  };

  return (
    <Pressable
      onPress={open}
      onPressIn={() => { press.value = withSpring(0.97, { damping: 36, stiffness: 320 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 32, stiffness: 260 }); }}
      accessibilityRole="button"
      accessibilityLabel={`${text.title}. ${text.cta}`}
    >
      <Reanimated.View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }, pressStyle]}>
        <View style={s.text}>
          <Text style={[s.eyebrow, { color: colors.goldText }]}>{text.eyebrow}</Text>
          <Text style={[s.title, { color: colors.text }]} numberOfLines={2}>{text.title}</Text>
          <Text style={[s.sub, { color: colors.muted }]} numberOfLines={2}>{text.sub}</Text>
          <View style={s.cta}>
            <Text style={[s.ctaText, { color: colors.goldText }]}>{text.cta}</Text>
            <ArrowRight size={15} color={colors.goldText} strokeWidth={2.4} />
          </View>
        </View>
        <View style={[s.image, { backgroundColor: colors.fill }]}>
          {image ? (
            <ExpoImage cachePolicy="memory-disk" source={imageSource(image)} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Icon size={30} color={colors.goldText} strokeWidth={1.6} />
          )}
        </View>
      </Reanimated.View>
    </Pressable>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth,
    padding: 18, overflow: "hidden",
  },
  text: { flex: 1, gap: 5 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.6 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13.5 },
  cta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  ctaText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  image: { width: 96, height: 112, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
