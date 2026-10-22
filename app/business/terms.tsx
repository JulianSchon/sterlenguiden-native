/** Villkor för företag — samma text som godkänns första gången (business/welcome). */
import { StyleSheet, Text, View } from "react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GradientCard } from "@/components/GradientCard";
import { Rise } from "@/components/Rise";
import { BUSINESS_TERMS } from "@/lib/businessTerms";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

export default function BusinessTerms() {
  const s = useThemedStyles(createStyles);
  return (
    <SettingsScreen title="Villkor för företag">
      <Rise index={0}>
        <Text style={s.lead}>Kort och rakt: så här fungerar det att finnas i Österlenappen.</Text>
      </Rise>
      <Rise index={1}>
        <GradientCard>
          <View style={s.body}>
            {BUSINESS_TERMS.map((t, i) => (
              <View key={t.title} style={[s.item, i > 0 && s.itemBorder]}>
                <Text style={s.title}>{t.title}</Text>
                <Text style={s.text}>{t.body}</Text>
              </View>
            ))}
          </View>
        </GradientCard>
      </Rise>
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  lead: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, color: c.muted, paddingHorizontal: 4 },
  body: { paddingHorizontal: 18 },
  item: { paddingVertical: 16, gap: 6 },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  title: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: c.text },
  text: { fontFamily: "Inter_400Regular", fontSize: 14.5, lineHeight: 21, color: c.muted },
});
