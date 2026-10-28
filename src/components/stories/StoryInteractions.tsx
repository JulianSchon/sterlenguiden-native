/**
 * Enkät och fråga i en story, som på Instagram. Samma kort visas när företaget gör storyn
 * (StoryItems) och när gästen tittar (StoryViewer), där de är levande: man röstar och ser resultatet,
 * eller skriver ett svar. Korten ritas i en fast bredd (CARD_W) och skalas till sin plats.
 *
 * Texterna gäller gästens språk (i18n), utom det företaget själv skrivit.
 */
import { StyleSheet, Text, View } from "react-native";
import i18n from "i18next";
import type { StoryInteraction } from "@/lib/business";

export const INTERACTION_W = 240;

/** Var en story i 9:16 hamnar på skärmen (den visas hel, mitt på) */
export function storyFrame(W: number, H: number) {
  let w = W;
  let h = (W * 16) / 9;
  if (h > H) { h = H; w = (H * 9) / 16; }
  return { left: (W - w) / 2, top: (H - h) / 2, w, h };
}

/** Andelarna av rösterna (0–1); inga röster = 0 och 0 */
export function pollShares(counts: [number, number]): [number, number] {
  const total = counts[0] + counts[1];
  return total ? [counts[0] / total, counts[1] / total] : [0, 0];
}

/**
 * Enkäten eller frågan på sin plats i storyn (samma ställe, storlek och vridning som företaget gav
 * den). Används av gästens visare och av företagets förhandsvisning, så de ser likadana ut.
 */
export function InteractionOverlay({ interaction: inter, frame, counts, mine, answered, showResults }: {
  interaction: StoryInteraction;
  frame: { left: number; top: number; w: number; h: number };
  /** Rösterna [första, andra] */
  counts?: [number, number] | null;
  mine?: number | null;
  answered?: boolean;
  /** Visa resultatet (gästen har röstat, eller företaget tittar) */
  showResults: boolean;
}) {
  const scale = (inter.w * frame.w) / INTERACTION_W;
  return (
    <View
      pointerEvents="none"
      style={[s.place, {
        left: frame.left + inter.x * frame.w - INTERACTION_W / 2,
        // Mitten på sin plats: kortets egen höjd (före skalningen) räknas ut ur den sparade storleken
        top: frame.top + inter.y * frame.h - (inter.h * frame.h) / scale / 2,
        transform: [{ rotate: `${inter.r}rad` }, { scale }],
      }]}
    >
      {inter.kind === "poll" ? (
        <PollCard
          question={inter.question}
          options={inter.options}
          mine={mine ?? null}
          results={showResults && counts ? pollShares(counts) : null}
          total={showResults && counts ? counts[0] + counts[1] : null}
        />
      ) : (
        <QuestionCard prompt={inter.prompt} sent={answered} />
      )}
    </View>
  );
}

/**
 * Enkäten: frågan överst och två svar bredvid varandra. Med `results` (andelar 0–1) visas staplar
 * och procent, och det man själv valt (`mine`) är markerat.
 */
export function PollCard({ question, options, results, mine, total }: {
  question: string;
  options: [string, string];
  results?: [number, number] | null;
  mine?: number | null;
  /** Antal röster totalt, under svaren */
  total?: number | null;
}) {
  return (
    <View style={s.card}>
      {!!question && <Text style={s.question} numberOfLines={3}>{question}</Text>}
      <View style={s.options}>
        {options.map((o, i) => {
          const share = results ? results[i] : null;
          return (
            <View key={i} style={[s.option, mine === i && s.optionMine]}>
              {share !== null && <View style={[s.optionFill, { width: `${Math.round(share * 100)}%` }, mine === i && s.optionFillMine]} />}
              <Text style={[s.optionText, mine === i && s.optionTextMine]} numberOfLines={2}>{o}</Text>
              {share !== null && <Text style={[s.optionShare, mine === i && s.optionTextMine]}>{Math.round(share * 100)} %</Text>}
            </View>
          );
        })}
      </View>
      {total != null && <Text style={s.total}>{i18n.t("stories.interaction.votes", { count: total })}</Text>}
    </View>
  );
}

/** Frågan: företagets fråga överst och en ruta att skriva i (bara en bild av rutan; trycket öppnar skrivandet) */
export function QuestionCard({ prompt, sent }: { prompt: string; sent?: boolean }) {
  return (
    <View style={s.card}>
      <View style={s.promptBox}>
        <Text style={s.prompt} numberOfLines={3}>{prompt}</Text>
      </View>
      <View style={s.answerBox}>
        <Text style={s.answerHint} numberOfLines={1}>
          {sent ? i18n.t("stories.interaction.sent") : i18n.t("stories.interaction.write")}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  place: { position: "absolute", width: INTERACTION_W },
  total: { fontFamily: "Inter_600SemiBold", fontSize: 12.5, color: "#6B6B70", textAlign: "center" },
  card: {
    width: INTERACTION_W, borderRadius: 20, backgroundColor: "#FFFFFF", padding: 12, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10,
  },
  question: { fontFamily: "Montserrat_700Bold", fontSize: 17, lineHeight: 21, color: "#111111", textAlign: "center" },
  options: { flexDirection: "row", gap: 8 },
  option: {
    flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: "#F1F1F3", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 8, paddingVertical: 8, overflow: "hidden",
  },
  optionMine: { backgroundColor: "#F6EBCF" },
  optionFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(17,17,17,0.08)" },
  optionFillMine: { backgroundColor: "rgba(201,162,78,0.45)" },
  optionText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: "#111111", textAlign: "center" },
  optionTextMine: { color: "#5C4410" },
  optionShare: { fontFamily: "Inter_700Bold", fontSize: 12.5, color: "#444444", marginTop: 2 },
  promptBox: { borderRadius: 14, backgroundColor: "#C9A24E", paddingHorizontal: 12, paddingVertical: 12 },
  prompt: { fontFamily: "Montserrat_700Bold", fontSize: 16.5, lineHeight: 21, color: "#1A1408", textAlign: "center" },
  answerBox: { borderRadius: 12, backgroundColor: "#F1F1F3", paddingHorizontal: 12, paddingVertical: 12 },
  answerHint: { fontFamily: "Inter_500Medium", fontSize: 14, color: "#8A8A8E", textAlign: "center" },
});
