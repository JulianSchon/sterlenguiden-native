/**
 * Det här finns hos er: parkering, wifi, hundvänligt … Ett reglage per sak. Det som är på syns
 * under Praktiskt på platssidan, och gästerna hittar er när de söker på det ("hundvänligt").
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsGroup";
import { IconSwitch } from "@/components/IconSwitch";
import { Rise } from "@/components/Rise";
import { Skeleton } from "@/components/Skeleton";
import { SaveIndicator } from "@/components/business/PortalParts";
import { useBusinessPlace, usePlaceAutosave, usePortalPlace } from "@/hooks/useBusiness";
import { PRACTICAL, parseAmenities } from "@/lib/mapFilters";
import { useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";
import i18n from "i18next";

const ITEMS = PRACTICAL.filter((p) => p.id !== "openNow");
const HELP: Record<string, string> = {
  pets: "Hundar är välkomna inne",
  outdoor: "Man kan sitta ute",
  accessible: "Fungerar med rullstol och rullator",
  family: "Bra för barn – barnstol, lekhörna …",
  vegetarian: "Det finns vegetariska alternativ",
  ev: "Laddstolpe för elbil",
  booking: "Gästerna behöver boka innan",
};

export default function BusinessAmenities() {
  const s = useThemedStyles(createStyles);
  const { placeId } = usePortalPlace();
  const { data: place } = useBusinessPlace(placeId);
  const auto = usePlaceAutosave(placeId, 300);
  const [on, setOn] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (place && !on) setOn(parseAmenities(place.amenities));
  }, [place, on]);

  const toggle = (id: string, value: boolean) => {
    if (!on) return;
    const next = { ...on, [id]: value };
    setOn(next);
    // Bara det som finns sparas (av = saknas)
    auto.queue({ amenities: Object.fromEntries(Object.entries(next).filter(([k, v]) => v && ITEMS.some((i) => i.id === k))) });
  };

  return (
    <SettingsScreen title="Det här finns" right={<SaveIndicator state={auto.state} onRetry={auto.flush} />}>
      <Rise index={0}>
        <Text style={s.lead}>Slå på det som finns hos er. Det syns på er sida, och gästerna hittar er när de söker på det.</Text>
      </Rise>
      <Rise index={1}>
        {on ? (
          <SettingsGroup>
            {ITEMS.map((item) => (
              <SettingsRow
                key={item.id}
                icon={item.Icon}
                label={i18n.t(item.labelKey as "map.practical.openNow", { lng: "sv" })}
                subtitle={HELP[item.id]}
                right={<IconSwitch value={!!on[item.id]} onChange={(v) => toggle(item.id, v)} />}
              />
            ))}
          </SettingsGroup>
        ) : (
          <View style={{ gap: 10 }}>{ITEMS.map((i) => <Skeleton key={i.id} height={64} radius={16} />)}</View>
        )}
      </Rise>
      {auto.error && <Text style={s.error}>{auto.error}</Text>}
    </SettingsScreen>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  lead: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, color: c.muted, paddingHorizontal: 4 },
  error: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.danger, textAlign: "center" },
});
