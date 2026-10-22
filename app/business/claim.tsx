/**
 * "Är det här ditt företag?" — att ta hand om en plats i appen.
 *
 *  1. Platsen och en bock: "Jag driver eller jobbar på …" (så ingen trycker vidare av misstag).
 *  2. Har platsen en e-post skickas en sexsiffrig kod dit — bara den som driver företaget kan läsa
 *     den. Kommer man inte åt adressen (eller saknas den) skickar man en förfrågan och mejlar oss
 *     från företagets egen adress. Det mejlet är beviset; admin godkänner. Ingen ringer.
 *  3. Rätt kod: klart, man sköter platsen. Förfrågan: "Mejla oss från företagets adress".
 * Har platsen redan någon som sköter den går förfrågan till dem i stället.
 *
 * Databasen sätter gränserna (högst 3 koder per företag och dygn, 5 per person, 18 år), så ingen
 * kan fylla ett företags inkorg med koder.
 */
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { Check, Mail } from "lucide-react-native";
import { AUTH_GUTTER, AuthButton, FieldNote, TextButton } from "@/components/auth/AuthParts";
import { StepLayout } from "@/components/onboarding/StepLayout";
import { CodeBoxes, type CodePhase } from "@/components/onboarding/CodeBoxes";
import { Skeleton } from "@/components/Skeleton";
import { WizardFrame } from "@/components/business/Wizard";
import { DoneMoment } from "@/components/business/WizardParts";
import {
  cancelRequest, claimSendCode, claimVerify, requestAccess, useBusinessOverview, useClaimInfo, type ClaimResult,
} from "@/hooks/useBusiness";
import { placeImages } from "@/hooks/usePlaces";
import { businessError, type ClaimInfo } from "@/lib/business";
import { BUSINESS_EMAIL as HELP_EMAIL } from "@/lib/appInfo";
import { useTheme, useThemedStyles } from "@/theme/ThemeProvider";
import type { ThemeColors } from "@/theme/colors";

type Step = "intro" | "method" | "code" | "request" | "sent" | "done";
const PROGRESS: Record<Step, number> = { intro: 0.25, method: 0.5, code: 0.75, request: 0.75, sent: 1, done: 1 };

/** Mejlet som bevisar att man driver företaget: skickas från företagets egen adress */
function mailProof(placeName: string, placeId: number) {
  const subject = encodeURIComponent(`${placeName} i Österlenappen`);
  const body = encodeURIComponent(`Hej! Jag skickar det här från vår egen e-post, så ni vet att det är vi som vill ta hand om ${placeName} (nr ${placeId}) i appen.`);
  Linking.openURL(`mailto:${HELP_EMAIL}?subject=${subject}&body=${body}`).catch(() => {});
}

function sendProblem(r: ClaimResult): string {
  switch (r.reason) {
    case "wait": return `Vänta ${r.seconds ?? 60} sekunder innan du ber om en ny kod.`;
    case "too_many_place": return "Det har skickats många koder till företaget i dag. Försök i morgon – eller skicka en förfrågan i stället.";
    case "too_many_user": return "Du har bett om många koder i dag. Försök i morgon.";
    case "has_owner": return "Någon sköter redan platsen.";
    case "not_adult": return "Du behöver vara 18 år.";
    default: return "Koden kunde inte skickas. Skicka en förfrågan i stället.";
  }
}

export default function ClaimScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { place: placeParam } = useLocalSearchParams<{ place?: string }>();
  const placeId = Number(placeParam) || 0;
  const { data: info, error: infoError, refetch } = useClaimInfo(placeId);
  const { data: overview } = useBusinessOverview();
  const [step, setStep] = useState<Step>("intro");
  const [forward, setForward] = useState(true);
  // Om man kom till förfrågan via "Vi skickar en kod" (då går pilen dit, annars till början)
  const cameFromMethod = useRef(false);
  const go = (next: Step, fwd = true) => {
    if (fwd) cameFromMethod.current = step === "method" || step === "code";
    setForward(fwd);
    setStep(next);
  };

  const back = () => {
    if (step === "intro" || step === "sent" || step === "done") router.back();
    else if (step === "method") go("intro", false);
    else if (step === "code") go("method", false);
    else if (step === "request") go(!info?.has_owner && info?.email && cameFromMethod.current ? "method" : "intro", false);
  };

  // Inställningar och platssidan får veta (inte den här sidans egen fråga — då hoppade sidan förbi Klart)
  const finished = async () => {
    await queryClient.invalidateQueries({ queryKey: ["business", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["places"] });
  };

  let content: React.ReactNode;
  if (infoError) {
    content = (
      <StepLayout title="Det går inte just nu" subtitle={businessError(infoError)}
        footer={<AuthButton label="Försök igen" onPress={() => refetch()} />} />
    );
  } else if (!info) {
    content = <View style={{ padding: AUTH_GUTTER, gap: 16 }}><Skeleton height={34} width="70%" radius={8} /><Skeleton height={180} radius={20} /></View>;
  } else if (info.is_business === false) {
    content = (
      <StepLayout title="Det här är ingen företagssida" subtitle={`${info.place.name} är en plats i appen, inte ett företag. Tycker du att något är fel? Tipsa oss längst ner på sidan.`}
        footer={<AuthButton label="Okej" onPress={() => router.back()} />}>
        <PlaceCard info={info} />
      </StepLayout>
    );
  } else if (info.role) {
    content = (
      <StepLayout title="Du sköter redan den här sidan" subtitle={`Allt för ${info.place.name} finns under Mitt företag.`}
        footer={<AuthButton label="Öppna Mitt företag" onPress={() => router.replace(`/business?place=${placeId}` as never)} />}>
        <PlaceCard info={info} />
      </StepLayout>
    );
  } else if (info.pending && step !== "sent") {
    content = (
      <StepLayout
        title="Vi har fått er förfrågan"
        subtitle={info.pending === "join"
          ? `Den har gått till dem som sköter ${info.place.name}. Du får tillgång när de godkänt.`
          : `Har ni mejlat oss från ${info.place.name}s egen e-post? Då godkänner vi så snart vi sett det. Ni ser det under Inställningar.`}
        footer={<>
          {info.pending === "claim" && <AuthButton label="Mejla oss från företagets e-post" onPress={() => mailProof(info.place.name, placeId)} />}
          <AuthButton label="Klart" variant={info.pending === "claim" ? "outline" : "primary"} onPress={() => router.back()} />
          <TextButton label="Ta tillbaka förfrågan" onPress={async () => {
            const req = overview?.requests.find((r) => r.place_id === placeId && r.status === "pending");
            if (req) await cancelRequest(req.id).catch(() => {});
            await finished();
            refetch();
          }} />
        </>}>
        <PlaceCard info={info} />
      </StepLayout>
    );
  } else if (!info.adult && !info.has_owner) {
    content = (
      <StepLayout title="Du behöver vara 18 år" subtitle="För att ta hand om ett företags sida i appen behöver man vara myndig. Be någon på företaget göra det – sedan kan de bjuda in dig."
        footer={<AuthButton label="Okej" onPress={() => router.back()} />}>
        <PlaceCard info={info} />
      </StepLayout>
    );
  } else {
    content = (
      <Flow
        info={info}
        step={step}
        go={go}
        onFinished={finished}
        onOpen={() => router.replace(`/business/welcome?place=${placeId}` as never)}
        onClose={() => router.back()}
      />
    );
  }

  return (
    <WizardFrame stepKey={`${step}-${!!info}`} progress={PROGRESS[step]} forward={forward} onBack={back} hideBar={step === "done" || step === "sent"}>
      {content}
    </WizardFrame>
  );
}

function Flow({ info, step, go, onFinished, onOpen, onClose }: {
  info: ClaimInfo;
  step: Step;
  go: (s: Step, fwd?: boolean) => void;
  onFinished: () => Promise<void>;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const placeId = info.place.id;
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<CodePhase>("typing");
  const [focused, setFocused] = useState(true);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [sentKind, setSentKind] = useState<"claim" | "join">("claim");
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (step !== "code") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Ett tidigare skickat (fortfarande giltigt) kod: man kan fortsätta skriva in den
  useEffect(() => {
    if (info.code_active && step === "method") setResendAt(Date.now() + 60_000);
  }, [info.code_active, step]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await claimSendCode(placeId);
      if (!r.ok) {
        setError(sendProblem(r));
        if (r.reason === "wait" && info.code_active) go("code");
        return;
      }
      setResendAt(Date.now() + 60_000);
      setCode("");
      setPhase("typing");
      go("code");
    } catch (e) {
      setError(businessError(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setPhase("checking");
    setError(null);
    const started = Date.now();
    try {
      const r = await claimVerify(placeId, value);
      // Snurret får synas en kort stund även om svaret kom fort (som i onboardingen)
      await new Promise((res) => setTimeout(res, Math.max(0, 950 - (Date.now() - started))));
      if (r.ok) {
        setPhase("ok");
        return;
      }
      setPhase("wrong");
      setError(r.reason === "expired" ? "Koden har gått ut. Be om en ny." : r.reason === "locked" ? "För många fel försök. Be om en ny kod." : r.reason === "has_owner" ? "Någon har precis tagit hand om platsen." : "Fel kod – försök igen.");
      setCode("");
      setTimeout(() => setPhase((p) => (p === "wrong" ? "typing" : p)), 1000);
    } catch (e) {
      setPhase("typing");
      setError(businessError(e));
    }
  };

  const submitRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await requestAccess(placeId, null, null, null);
      if (!r.ok) {
        setError(r.reason === "already_pending" ? "Du har redan skickat en förfrågan." : r.reason === "too_many" ? "Du har skickat många förfrågningar i dag. Försök i morgon." : r.reason === "closed" ? "Den här sidan tar inte emot förfrågningar. Be dem bjuda in dig." : "Det gick inte att skicka.");
        return;
      }
      setSentKind(r.kind === "join" ? "join" : "claim");
      // Mejlet som visar att det är ert företag öppnas direkt, färdigskrivet
      if (r.kind !== "join") mailProof(info.place.name, placeId);
      await onFinished();
      go("sent");
    } catch (e) {
      setError(businessError(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === "intro") {
    return (
      <StepLayout
        title={info.has_owner ? `Jobbar du på ${info.place.name}?` : "Är det här ert företag?"}
        subtitle={info.has_owner
          ? "Någon sköter redan sidan. Skicka en förfrågan till dem – eller be dem bjuda in dig."
          : "Ta hand om er sida i Österlenappen: öppettider, bilder, erbjudanden i Österlenpasset och evenemang. Det kostar ingenting."}
        scroll
        footer={<AuthButton label="Fortsätt" disabled={!sure} onPress={() => go(info.has_owner ? "request" : info.email ? "method" : "request")} />}
      >
        <PlaceCard info={info} />
        <Pressable style={[s.sure, sure && { borderColor: colors.gold }]} onPress={() => setSure(!sure)} accessibilityRole="checkbox" accessibilityState={{ checked: sure }}>
          <View style={[s.box, sure && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
            {sure && <Check size={15} color={colors.onGold} strokeWidth={3} />}
          </View>
          <Text style={s.sureText}>Jag driver eller jobbar på {info.place.name}</Text>
        </Pressable>
      </StepLayout>
    );
  }

  if (step === "method") {
    return (
      <StepLayout
        title="Vi skickar en kod"
        subtitle="Koden går till företagets egen e-post – så vet vi att det är ni. Den gäller i 15 minuter."
        footer={<>
          {error && <FieldNote tone="danger" text={error} />}
          <AuthButton label="Skicka koden" onPress={send} loading={busy} />
          <TextButton label="Jag kommer inte åt den adressen" onPress={() => { setError(null); go("request"); }} />
        </>}
      >
        <View style={s.emailCard}>
          <Mail size={20} color={colors.goldText} strokeWidth={2} />
          <Text style={s.emailText} numberOfLines={1}>{info.email}</Text>
        </View>
        {info.code_active && (
          <TextButton label="Jag har redan en kod" onPress={() => go("code")} />
        )}
      </StepLayout>
    );
  }

  if (step === "code") {
    const left = Math.max(0, Math.ceil((resendAt - now) / 1000));
    const quiet = phase === "checking" || phase === "ok";
    return (
      <StepLayout
        title="Skriv in koden"
        subtitle={`Vi har skickat sex siffror till ${info.email}.`}
        footer={<>
          <TextButton label={left > 0 ? `Ny kod om ${left} s` : "Skicka en ny kod"} onPress={left > 0 || quiet ? () => {} : send} />
          <TextButton label="Jag fick ingen kod" onPress={() => { setError(null); go("request"); }} />
        </>}
      >
        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Koden">
          <CodeBoxes code={code} length={6} width={width - AUTH_GUTTER * 2} focused={focused} phase={phase} onOkShown={async () => { await onFinished(); go("done"); }} />
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, "").slice(0, 6);
            if (phase === "wrong") setPhase("typing");
            setCode(digits);
            if (digits.length === 6 && phase !== "checking") verify(digits);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          caretHidden
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={s.hidden}
        />
        {!quiet && error ? <FieldNote tone="danger" text={error} /> : null}
        {!quiet && !error ? <FieldNote text="Hittar ni inte mejlet? Kolla skräpposten." /> : null}
      </StepLayout>
    );
  }

  if (step === "request") {
    const claim = !info.has_owner;
    return (
      <StepLayout
        title={claim ? "Visa att det är ert företag" : "Skicka en förfrågan"}
        subtitle={claim
          ? "Skicka ett mejl till oss från företagets e-post – den ni använder i jobbet. När mejlet kommit fram får du tillgång."
          : `Förfrågan går till dem som sköter ${info.place.name}. Du får tillgång när de godkänt.`}
        footer={<>
          {error && <FieldNote tone="danger" text={error} />}
          <AuthButton label={claim ? "Skriv mejlet" : "Skicka förfrågan"} onPress={submitRequest} loading={busy} />
        </>}
      >
        {claim && (
          <View style={s.emailCard}>
            <Mail size={20} color={colors.goldText} strokeWidth={2} />
            <Text style={s.mailNote}>Mejlet är redan skrivet. Kolla bara att det skickas från företagets adress och tryck Skicka.</Text>
          </View>
        )}
      </StepLayout>
    );
  }

  if (step === "sent") {
    return (
      <DoneMoment
        title="Tack!"
        text={sentKind === "join"
          ? `Förfrågan har gått till ${info.place.name}. Du ser sidan under Inställningar när de godkänt.`
          : "När ditt mejl kommit fram får du tillgång – oftast inom en dag. Ert företag dyker då upp under Inställningar."}
        primary={{ label: "Klart", onPress: onClose }}
        secondary={sentKind === "join" ? undefined : { label: "Öppna mejlet igen", onPress: () => mailProof(info.place.name, placeId) }}
      />
    );
  }

  return (
    <DoneMoment
      title={`Nu sköter du ${info.place.name}`}
      text="Öppettider, bilder, erbjudanden och evenemang – allt ändrar ni själva, direkt i appen."
      primary={{ label: "Öppna Mitt företag", onPress: onOpen }}
    />
  );
}

function PlaceCard({ info }: { info: ClaimInfo }) {
  const s = useThemedStyles(createStyles);
  const image = placeImages(info.place.image_url)[0];
  return (
    <View style={s.place}>
      {image ? <ExpoImage source={{ uri: image }} style={s.placeImage} contentFit="cover" transition={150} /> : <View style={s.placeImage} />}
      <View style={s.placeBody}>
        <Text style={s.placeName}>{info.place.name}</Text>
        {info.place.town && <Text style={s.placeTown}>{info.place.town}</Text>}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  place: { borderRadius: 20, overflow: "hidden", backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  placeImage: { height: 150, backgroundColor: c.fill },
  placeBody: { padding: 14 },
  placeName: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: c.text },
  placeTown: { fontFamily: "Inter_500Medium", fontSize: 13.5, color: c.muted, marginTop: 2 },
  sure: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16,
    borderWidth: 1.5, borderColor: c.border, backgroundColor: c.raised,
  },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  sureText: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 15, lineHeight: 20, color: c.text },
  emailCard: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderRadius: 16,
    backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.goldBorder,
  },
  emailText: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 16, color: c.text },
  mailNote: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14.5, lineHeight: 20, color: c.text },
  hidden: { position: "absolute", opacity: 0, width: 1, height: 1 },
});
