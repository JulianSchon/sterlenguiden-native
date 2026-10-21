/**
 * En nyhet: rubriken som de andra undersidorna (tillbaka, NYHET, dela), omslagsbilden med rundade
 * hörn, datum, titel, ingress och brödtext. Bilder i texten ("![](adress)" eller en adress ensam
 * på en rad) och galleriet visas som bilder — tryck så öppnas de i helskärm med zoom. Längst ner
 * platsen nyheten handlar om och en länk, om de finns.
 *
 * Öppnas direkt om nyheten redan finns i telefonen (Hem hämtar de senaste); annars grått tills den
 * kommit.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { ArrowLeft, ArrowUpRight, ChevronRight, MapPin, Newspaper } from "lucide-react-native";
import { useNewsItem, type NewsItem } from "@/hooks/useNews";
import { useTheme } from "@/theme/ThemeProvider";
import { formatDate } from "@/i18n/dates";
import { openWebsite, withProtocol } from "@/lib/placeLinks";
import { pushOnce } from "@/lib/navigateOnce";
import { ShareIcon } from "@/components/ShareIcon";
import { Skeleton } from "@/components/Skeleton";
import { Rise } from "@/components/Rise";
import { PhotoViewer } from "@/components/place/PhotoViewer";

const GUTTER = 16;
const IMG_MD = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
const LONE_URL = /^(https?:\/\/\S+)$/i;

type Segment = { type: "text" | "image"; content: string };

/** Brödtexten i delar: text och bilder (markdown-bilder och adresser ensamma på en rad) */
function parseBody(text: string): Segment[] {
  const out: Segment[] = [];
  const images: Record<string, string> = {};
  let n = 0;
  const marked = text.replace(IMG_MD, (_m, _alt, url: string) => {
    const key = `__IMG_${n++}__`;
    images[key] = url;
    return key;
  });
  let buffer = "";
  const flush = () => {
    const t = buffer.trim();
    if (t) out.push({ type: "text", content: t });
    buffer = "";
  };
  for (const line of marked.split("\n")) {
    const t = line.trim();
    if (images[t]) { flush(); out.push({ type: "image", content: images[t] }); continue; }
    if (LONE_URL.test(t)) { flush(); out.push({ type: "image", content: t }); continue; }
    buffer += line + "\n";
  }
  flush();
  return out;
}

export default function NewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { data: fetched, isError } = useNewsItem(id ?? null);
  // Finns nyheten redan i listan som Hem hämtat visas den direkt
  const cached = useMemo(() => {
    for (const [, list] of queryClient.getQueriesData<NewsItem[]>({ queryKey: ["news"] })) {
      const hit = Array.isArray(list) ? list.find((n) => n.id === id) : undefined;
      if (hit) return hit;
    }
    return undefined;
  }, [queryClient, id]);
  const item = fetched ?? cached;

  const segments = useMemo(() => (item?.body ? parseBody(item.body) : []), [item?.body]);
  // Alla bilder i nyheten, i ordning — helskärmen bläddrar mellan dem
  const images = useMemo(() => [
    ...(item?.cover_image_url ? [item.cover_image_url] : []),
    ...segments.filter((x) => x.type === "image").map((x) => x.content),
    ...(item?.gallery_urls ?? []),
  ], [item, segments]);
  const [viewer, setViewer] = useState<number | null>(null);
  const openImage = (uri: string) => setViewer(Math.max(0, images.indexOf(uri)));

  const published = item?.published_at ?? item?.created_at;
  const share = () => {
    if (!item) return;
    const link = item.link_url ? `\n${withProtocol(item.link_url)}` : "";
    Share.share({ message: `${item.title}${link}` }).catch(() => {});
  };

  return (
    <View style={[s.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {/* Samma rubrik som de andra undersidorna */}
      <View style={s.header}>
        <TouchableOpacity style={[s.headerBtn, { backgroundColor: colors.fill, borderColor: colors.borderStrong }]} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>NYHET</Text>
        {item && (
          <TouchableOpacity style={[s.headerBtn, { backgroundColor: colors.fill, borderColor: colors.borderStrong }]} onPress={share}>
            <ShareIcon size={20} color={colors.text} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {!item ? (
        isError ? (
          <View style={s.center}>
            <Newspaper size={34} color={colors.faint} strokeWidth={1.6} />
            <Text style={[s.missingTitle, { color: colors.text }]}>Vi hittar inte nyheten</Text>
            <Text style={[s.missingText, { color: colors.muted }]}>Den kan ha tagits bort, eller så är du utan nät just nu.</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: GUTTER, gap: 12, paddingTop: 8 }} pointerEvents="none">
            <Skeleton height={220} radius={20} />
            <Skeleton width={120} height={12} radius={6} style={{ marginTop: 8 }} />
            <Skeleton width="85%" height={24} radius={8} />
            <Skeleton width="60%" height={24} radius={8} />
            <Skeleton height={14} radius={6} style={{ marginTop: 10 }} />
            <Skeleton height={14} radius={6} />
            <Skeleton width="70%" height={14} radius={6} />
          </View>
        )
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
          <Rise index={0}>
            {item.cover_image_url && (
              <Pressable onPress={() => openImage(item.cover_image_url!)} style={[s.cover, { backgroundColor: colors.fill }]}>
                <ExpoImage source={{ uri: item.cover_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" />
              </Pressable>
            )}
            <View style={s.content}>
              <Text style={[s.meta, { color: colors.goldText }]}>
                {["Österlenappen", published ? formatDate(published, "d MMMM yyyy") : null].filter(Boolean).join("  ·  ")}
              </Text>
              <Text style={[s.title, { color: colors.text }]}>{item.title}</Text>
              {!!item.ingress && <Text style={[s.ingress, { color: colors.text }]}>{item.ingress}</Text>}
            </View>
          </Rise>

          <Rise index={1}>
            <View style={s.content}>
              {segments.map((seg, i) => (seg.type === "image"
                ? <BodyImage key={i} uri={seg.content} onPress={() => openImage(seg.content)} />
                : <Text key={i} style={[s.body, { color: colors.muted }]}>{seg.content}</Text>))}
              {(item.gallery_urls ?? []).map((uri, i) => <BodyImage key={`g${i}`} uri={uri} onPress={() => openImage(uri)} />)}
            </View>

            {(item.place || item.link_url) && (
              <View style={[s.links, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {item.place && (
                  <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={() => pushOnce(router, `/place/${item.place!.id}`)}>
                    <View style={[s.linkIcon, { backgroundColor: colors.fill }]}>
                      <MapPin size={18} color={colors.text} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.linkLabel, { color: colors.muted }]}>Läs mer om platsen</Text>
                      <Text style={[s.linkTitle, { color: colors.text }]} numberOfLines={1}>{item.place.name}</Text>
                    </View>
                    <ChevronRight size={18} color={colors.faint} strokeWidth={2} />
                  </TouchableOpacity>
                )}
                {item.place && item.link_url && <View style={[s.line, { backgroundColor: colors.border }]} />}
                {item.link_url && (
                  <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={() => openWebsite(item.link_url!)}>
                    <View style={[s.linkIcon, { backgroundColor: colors.fill }]}>
                      <ArrowUpRight size={18} color={colors.text} strokeWidth={2} />
                    </View>
                    <Text style={[s.linkTitle, { flex: 1, color: colors.text }]} numberOfLines={1}>{item.link_label ?? "Läs mer"}</Text>
                    <ChevronRight size={18} color={colors.faint} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Rise>
        </ScrollView>
      )}

      <PhotoViewer images={images} start={viewer ?? 0} visible={viewer != null} onClose={() => setViewer(null)} />
    </View>
  );
}

/** En bild i texten. Går den inte att visa blir det en länk i stället */
function BodyImage({ uri, onPress }: { uri: string; onPress: () => void }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <TouchableOpacity onPress={() => openWebsite(uri)} activeOpacity={0.7}>
        <Text style={[s.fallbackLink, { color: colors.goldText }]} numberOfLines={1}>{uri}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <Pressable onPress={onPress} style={[s.bodyImage, { backgroundColor: colors.fill }]}>
      <ExpoImage source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} cachePolicy="memory-disk" onError={() => setFailed(true)} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", height: 64, paddingHorizontal: 16, gap: 12 },
  headerBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 15, letterSpacing: 1.5 },

  cover: { marginHorizontal: GUTTER, marginTop: 6, aspectRatio: 16 / 10, borderRadius: 20, overflow: "hidden" },
  content: { paddingHorizontal: GUTTER + 4, paddingTop: 20 },
  meta: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 27, lineHeight: 33, letterSpacing: -0.6, marginTop: 10 },
  ingress: { fontFamily: "Inter_500Medium", fontSize: 17, lineHeight: 26, marginTop: 14 },
  body: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 26, marginBottom: 18 },
  bodyImage: { width: "100%", aspectRatio: 4 / 3, borderRadius: 16, overflow: "hidden", marginBottom: 18 },
  fallbackLink: { fontFamily: "Inter_500Medium", fontSize: 13.5, marginBottom: 18, textDecorationLine: "underline" },

  links: { marginHorizontal: GUTTER, marginTop: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  linkIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  linkLabel: { fontFamily: "Inter_500Medium", fontSize: 12 },
  linkTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginTop: 1 },
  line: { height: StyleSheet.hairlineWidth, marginLeft: 64 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32, paddingBottom: 80 },
  missingTitle: { fontFamily: "Montserrat_700Bold", fontSize: 19, textAlign: "center" },
  missingText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
