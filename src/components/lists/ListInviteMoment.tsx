/**
 * Inbjudan till en lista som ett eget ögonblick (visas av belöningsvakten TrophyHost, var man än
 * är i appen, aldrig samtidigt som ett annat firande):
 *
 *  1. Skärmen mörknar, vännens profilbild (med ring) studsar in: "Mats har bjudit in dig!"
 *  2. Listans omslag glider upp, med namnet och antal platser.
 *  3. Avböj / Acceptera. Accepterar man studsar omslaget till, konfetti och en vibration —
 *     texten blir "Du är med i listan!" och knapparna Öppna listan / Stäng.
 *
 * Allt finns från start och tonas bara fram (knapparna också — ett tryck innan de syns räknas
 * inte). Svaret sparas av knapparna här; listan försvinner ur väntande inbjudningar när servern
 * svarat, men ögonblicket ligger kvar tills det stängts (TrophyHost).
 */
import { useMemo, useRef, useState } from "react";
import { Alert, Modal, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Reanimated, {
  Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAcceptListInvite, useDeclineListInvite, type PendingListInvite } from "@/hooks/useLists";
import { usePlaces, firstImageUrl } from "@/hooks/usePlaces";
import { useOnModalShown } from "@/hooks/useOnModalShown";
import { Avatar } from "@/components/profile/Avatar";
import { ListCover } from "@/components/lists/ListCover";
import { Confetti, GOLD, GhostButton, GoldButton } from "@/components/checkin/CelebrationFx";

const FG = "#F5F1E8";
const MUTED = "rgba(245,241,232,0.72)";
const AVATAR = 76;

export function ListInviteMoment({ invite, onOpenList, onClose }: {
  invite: PendingListInvite;
  /** Öppna listan — anropas medan ögonblicket fortfarande täcker skärmen */
  onOpenList: (listId: string) => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const accept = useAcceptListInvite();
  const decline = useDeclineListInvite();
  const { data: places = [] } = usePlaces();
  const [joined, setJoined] = useState(false);
  const ready = useRef(false);
  const busy = useRef(false);
  const leaving = useRef(false);

  const images = useMemo(() => {
    const byId = new Map(places.map((p) => [p.id, firstImageUrl(p.image_url)]));
    return invite.firstPlaceIds.map((id) => byId.get(id)).filter((u): u is string => !!u);
  }, [places, invite.firstPlaceIds]);
  const coverSize = Math.round(Math.min(width * 0.56, height * 0.28, 240));

  const backdrop = useSharedValue(0);
  const avatarIn = useSharedValue(0);
  const textIn = useSharedValue(0);
  const coverIn = useSharedValue(0);
  const buttonsIn = useSharedValue(0);
  const joinedV = useSharedValue(0);
  const pop = useSharedValue(0);
  const burst = useSharedValue(0);
  const leave = useSharedValue(0);

  const onShow = useOnModalShown(() => {
    backdrop.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    avatarIn.value = withDelay(150, withSpring(1, { damping: 11, stiffness: 160 }));
    textIn.value = withDelay(380, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    coverIn.value = withDelay(540, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    buttonsIn.value = withDelay(950, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    setTimeout(() => { ready.current = true; }, 950);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 200);
  });

  const respondAccept = async () => {
    if (!ready.current || busy.current || leaving.current) return;
    busy.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await accept.mutateAsync(invite.listId);
      // Du är med: omslaget studsar till, konfetti, texterna och knapparna byts
      pop.value = withSequence(withTiming(1, { duration: 110 }), withSpring(0, { damping: 8, stiffness: 220 }));
      burst.value = 0;
      burst.value = withTiming(1, { duration: 1400, easing: Easing.linear });
      joinedV.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setJoined(true);
    } catch {
      Alert.alert("Något gick fel", "Det gick inte att gå med i listan. Försök igen.");
    } finally {
      busy.current = false;
    }
  };

  const exit = (openList: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    const after = () => {
      if (openList) onOpenList(invite.listId);
      backdrop.value = withDelay(openList ? 500 : 40, withTiming(0, { duration: 320, easing: Easing.out(Easing.quad) }, (fin) => {
        if (fin) runOnJS(onClose)();
      }));
    };
    leave.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) runOnJS(after)();
    });
  };

  const respondDecline = () => {
    if (!ready.current || busy.current) return;
    decline.mutate(invite.listId);
    exit(false);
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 24 }] }));
  const avatarStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, avatarIn.value * 2),
    transform: [{ scale: interpolate(avatarIn.value, [0, 1], [0.5, 1]) }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textIn.value, transform: [{ translateY: interpolate(textIn.value, [0, 1], [12, 0]) }] }));
  const inviteTextStyle = useAnimatedStyle(() => ({ opacity: 1 - joinedV.value }));
  const joinedTextStyle = useAnimatedStyle(() => ({ opacity: joinedV.value, transform: [{ scale: interpolate(joinedV.value, [0, 1], [0.92, 1]) }] }));
  const coverStyle = useAnimatedStyle(() => ({
    opacity: coverIn.value,
    transform: [{ translateY: interpolate(coverIn.value, [0, 1], [36, 0]) }, { scale: 1 + pop.value * 0.08 }],
  }));
  const buttonsStyle = useAnimatedStyle(() => ({ opacity: buttonsIn.value, transform: [{ translateY: interpolate(buttonsIn.value, [0, 1], [14, 0]) }] }));
  const answerStyle = useAnimatedStyle(() => ({ opacity: 1 - joinedV.value }));
  const afterStyle = useAnimatedStyle(() => ({ opacity: joinedV.value }));

  const bottomPad = Math.max(insets.bottom, 16) + 8;
  const places_ = invite.placeCount === 1 ? "1 plats" : `${invite.placeCount} platser`;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onShow={onShow} onRequestClose={() => exit(false)}>
      <View style={s.root}>
        <Reanimated.View style={[StyleSheet.absoluteFill, s.backdrop, backdropStyle]} />
        <Reanimated.View style={[s.root, contentStyle]}>
          <View style={s.center}>
            <Reanimated.View style={[s.avatarRoom, avatarStyle]}>
              <Avatar size={AVATAR} path={invite.ownerAvatarPath} name={invite.ownerName} color={invite.ownerCircleColor ?? "#2A2A2A"} ring={invite.ownerRing} />
            </Reanimated.View>

            <Reanimated.View style={[s.texts, textStyle]}>
              <Reanimated.View style={inviteTextStyle}>
                <Text style={s.eyebrow}>NY INBJUDAN</Text>
                <Text style={s.lead}>{invite.ownerName} har bjudit in dig!</Text>
              </Reanimated.View>
              <Reanimated.View style={[StyleSheet.absoluteFill, joinedTextStyle]}>
                <Text style={s.eyebrow}>KLART</Text>
                <Text style={s.lead}>Du är med i listan!</Text>
              </Reanimated.View>
            </Reanimated.View>

            <Reanimated.View style={[{ marginTop: 26, alignItems: "center" }, coverStyle]}>
              <ListCover coverImageUrl={invite.coverImageUrl} images={images} size={coverSize} radius={20} />
              <View style={[StyleSheet.absoluteFill, s.confettiOrigin]} pointerEvents="none">
                <Confetti progress={burst} count={40} power={1.1} />
              </View>
            </Reanimated.View>
            <Reanimated.View style={[{ alignItems: "center", marginTop: 14 }, coverStyle]}>
              <Text style={s.listName} numberOfLines={2}>{invite.listName}</Text>
              <Text style={s.count}>{places_}</Text>
            </Reanimated.View>
          </View>

          <Reanimated.View style={[s.buttons, { paddingBottom: bottomPad }, buttonsStyle]}>
            <Reanimated.View style={[s.buttonStack, answerStyle]} pointerEvents={joined ? "none" : "auto"}>
              <GoldButton label="Acceptera" onPress={respondAccept} />
              <GhostButton label="Avböj" onPress={respondDecline} />
            </Reanimated.View>
            <Reanimated.View style={[StyleSheet.absoluteFill, s.buttonStack, { paddingBottom: bottomPad, paddingHorizontal: 20, justifyContent: "flex-end" }, afterStyle]} pointerEvents={joined ? "auto" : "none"}>
              <GoldButton label="Öppna listan" onPress={() => exit(true)} />
              <GhostButton label="Stäng" onPress={() => exit(false)} />
            </Reanimated.View>
          </Reanimated.View>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#0B0A08" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  // Luft runt profilbilden så ringen får plats
  avatarRoom: { padding: 22 },
  texts: { alignItems: "center", alignSelf: "stretch", marginTop: 4 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 2.6, color: GOLD, textAlign: "center" },
  lead: { fontFamily: "Montserrat_700Bold", fontSize: 24, color: FG, marginTop: 6, textAlign: "center" },
  confettiOrigin: { alignItems: "center", justifyContent: "center" },
  listName: { fontFamily: "Montserrat_700Bold", fontSize: 19, color: FG, textAlign: "center" },
  count: { fontFamily: "Inter_500Medium", fontSize: 14, color: MUTED, marginTop: 4 },
  buttons: { paddingHorizontal: 20 },
  buttonStack: { gap: 10 },
});
