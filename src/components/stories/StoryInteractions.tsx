/**
 * Enkät och fråga i en story, som på Instagram. Samma kort visas när företaget gör storyn
 * (StoryItems) och när gästen tittar (StoryViewer), där de är levande: man röstar och ser resultatet,
 * eller skriver ett svar. Korten ritas i en fast bredd (CARD_W) och skalas till sin plats.
 *
 * Texterna gäller gästens språk (i18n), utom det företaget själv skrivit.
 */
import { StyleSheet, Text, View } from "react-native";
import i18n from "i18next";

export const INTERACTION_W = 240;

/**
 * Enkäten: frågan överst och två svar bredvid varandra. Med `results` (andelar 0–1) visas staplar
 * och procent, och det man själv valt (`mine`) är markerat.
 */
export function PollCard({ question, options, results, mine }: {
  question: string;
  options: [string, string];
  results?: [number, number] | null;
  mine?: number | null;
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
