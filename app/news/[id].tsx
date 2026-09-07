import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, Linking, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react-native";
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from "react-native-svg";
import { useNewsItem } from "@/hooks/useNews";
import { colors } from "@/lib/colors";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const { width: W } = Dimensions.get("window");
const GOLD = "#C9A24C";
const CHARCOAL = "#121212";

// Regex som matchar:
// - Markdown: ![alt](https://...jpg)
// - Bara en bild-URL på en rad: https://...jpg
const IMG_MD   = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
const IMG_URL  = /^(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|avif))$/i;

/**
 * Delar upp body-texten i segment: { type: "text" | "image", content: string }
 * Hanterar markdown-bildlänkar (![](url)) och rena bild-URLer på egna rader.
 */
function parseBody(text: string): Array<{ type: "text" | "image"; content: string; alt?: string }> {
  const segments: Array<{ type: "text" | "image"; content: string; alt?: string }> = [];

  // Ersätt markdown-bilder med en platshållare och spara mappning
  const imageMap: Record<string, { url: string; alt: string }> = {};
  let idx = 0;
  const withPlaceholders = text.replace(IMG_MD, (_full, alt, url) => {
    const key = `__IMG_${idx++}__`;
    imageMap[key] = { url, alt };
    return key;
  });

  // Gå igenom rad för rad
  const lines = withPlaceholders.split("\n");
  let textBuffer = "";

  const flushText = () => {
    const trimmed = textBuffer.trimEnd();
    if (trimmed) segments.push({ type: "text", content: trimmed });
    textBuffer = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Platshållare för markdown-bild
    const mdKey = Object.keys(imageMap).find((k) => trimmed === k);
    if (mdKey) {
      flushText();
      segments.push({ type: "image", content: imageMap[mdKey].url, alt: imageMap[mdKey].alt });
      continue;
    }

    // Ren bild-URL på en rad
    if (IMG_URL.test(trimmed)) {
      flushText();
      segments.push({ type: "image", content: trimmed });
      continue;
    }

    textBuffer += line + "\n";
  }
  flushText();
  return segments;
}

export default function NewsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: item, isLoading } = useNewsItem(id ?? null);

  const publishedDate = item?.published_at ?? item?.created_at;
  const dateStr = publishedDate
    ? format(new Date(publishedDate), "d MMMM yyyy", { locale: sv })
    : null;

  // Galleri-bilder (Postgres text[])
  const galleryImages = item?.gallery_urls ?? [];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Nyheter</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : !item ? null : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

          {/* Cover image */}
          {item.cover_image_url ? (
            <Image source={{ uri: item.cover_image_url }} style={s.cover} resizeMode="cover" />
          ) : null}

          <View style={s.content}>
            {/* Badge + datum */}
            <View style={s.metaRow}>
              {/* Gradient badge */}
              <View style={{ borderRadius: 12, overflow: "hidden", alignSelf: "flex-start" }}>
                <Svg width={130} height={26} style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgGrad id="bg" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0%"   stopColor="#FFF200" />
                      <Stop offset="35%"  stopColor="#FFB000" />
                      <Stop offset="75%"  stopColor="#FF5000" />
                      <Stop offset="100%" stopColor="#FF8000" />
                    </SvgGrad>
                  </Defs>
                  <Rect width="130" height="26" fill="url(#bg)" />
                </Svg>
                <Text style={s.badgeText}>ÖSTERLENAPPEN</Text>
              </View>
              {dateStr && <Text style={s.dateText}>{dateStr}</Text>}
            </View>

            {/* Titel */}
            <Text style={s.title}>{item.title}</Text>

            {/* Ingress */}
            {item.ingress ? (
              <Text style={s.ingress}>{item.ingress}</Text>
            ) : null}

            {/* Body – renderar inbakade bilder */}
            {item.body
              ? parseBody(item.body).map((seg, i) =>
                  seg.type === "image" ? (
                    <Image
                      key={i}
                      source={{ uri: seg.content }}
                      style={s.inlineImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text key={i} style={s.body}>{seg.content}</Text>
                  )
                )
              : null}

            {/* Galleri-bilder */}
            {galleryImages.map((uri, i) => (
              <Image key={i} source={{ uri }} style={s.galleryImage} resizeMode="cover" />
            ))}
          </View>

          {/* Länksektion */}
          {(item.place || item.link_url) && (
            <View style={s.linksSection}>
              {/* Plats i appen */}
              {item.place && (
                <TouchableOpacity
                  style={s.linkRow}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/place/${item.place!.id}` as any)}
                >
                  <View style={s.linkIcon}>
                    <MapPin size={18} color={GOLD} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.linkLabel}>LÄS MER OM PLATSEN</Text>
                    <Text style={s.linkTitle}>{item.place.name}</Text>
                    {item.place.nearest_town && (
                      <Text style={s.linkSub}>{item.place.nearest_town}</Text>
                    )}
                  </View>
                  <ArrowLeft size={18} color={colors.foregroundMuted} style={{ transform: [{ rotate: "180deg" }] }} />
                </TouchableOpacity>
              )}

              {/* Extern länk */}
              {item.link_url && (
                <TouchableOpacity
                  style={s.linkRow}
                  activeOpacity={0.8}
                  onPress={() => Linking.openURL(item.link_url!)}
                >
                  <View style={s.linkIcon}>
                    <ExternalLink size={18} color={colors.foregroundMuted} strokeWidth={2} />
                  </View>
                  <Text style={[s.linkTitle, { flex: 1 }]}>{item.link_label ?? "Läs mer"}</Text>
                  <ArrowLeft size={18} color={colors.foregroundMuted} style={{ transform: [{ rotate: "180deg" }] }} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CHARCOAL },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16, fontWeight: "600", color: colors.foreground,
    fontFamily: "Inter_600SemiBold",
  },

  cover: { width: W, height: W * 0.6 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  metaRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14,
  },
  badgeText: {
    fontSize: 10, fontWeight: "800", color: "#1a1200",
    letterSpacing: 1, paddingHorizontal: 12, paddingVertical: 6,
  },
  dateText: { fontSize: 13, color: colors.foregroundMuted },

  title: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 26, color: "#F4EFE3",
    lineHeight: 34, marginBottom: 14,
  },
  ingress: {
    fontSize: 16, color: "rgba(244,239,227,0.85)",
    lineHeight: 24, marginBottom: 20,
    fontFamily: "Inter_400Regular",
  },
  body: {
    fontSize: 15, color: colors.foregroundMuted,
    lineHeight: 24, marginBottom: 20,
    fontFamily: "Inter_400Regular",
  },
  inlineImage: {
    width: "100%", aspectRatio: 4 / 3,
    borderRadius: 12, marginBottom: 16, marginTop: 4,
  },
  galleryImage: {
    width: "100%", aspectRatio: 4 / 3,
    borderRadius: 16, marginBottom: 16,
  },

  linksSection: {
    marginTop: 8, marginHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 16, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  linkIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
  },
  linkLabel: {
    fontSize: 10, fontWeight: "700", color: GOLD, letterSpacing: 1, marginBottom: 2,
  },
  linkTitle: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  linkSub: { fontSize: 12, color: colors.foregroundMuted, marginTop: 1 },
});
