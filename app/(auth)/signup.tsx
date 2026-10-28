/**
 * Skapa konto och onboardingen: ett steg i taget, med en balk överst som fylls för varje steg.
 *
 * Tre vägar in (mode):
 * - "email" (Fortsätt med e-post): e-post → koden från mejlet → lösenord → resten.
 * - "resume": inloggad men inte klar — efter Apple/Google, eller om appen stängdes mitt i: resten.
 * - "reset" (Glömt lösenordet): e-post → kod → nytt lösenord → in i appen.
 * Resten = mörkt eller ljust → namn → användarnamn → födelsedag → platsen (bara om telefonen inte redan svarat) → var man
 * bor (orten där man är föreslås) → vad man gillar → favoriter → välkommen.
 *
 * Svaren sparas i telefonen efter varje steg och skrivs till servern först i välkomststeget
 * (lib/onboarding). Tillbaka går ett steg bakåt; från det första steget efter inloggningen
 * frågar vi om man vill avbryta (då loggas man ut och kan fortsätta senare).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, BackHandler, Keyboard, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight } from "react-native-reanimated";
import * as Location from "expo-location";
import { Image as ExpoImage } from "expo-image";
import { useTranslation } from "react-i18next";
import type { AuthError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { usePlaces } from "@/hooks/usePlaces";
import { useOffers } from "@/hooks/useOffers";
import { useEvents } from "@/hooks/useEvents";
import { StepBar } from "@/components/auth/AuthParts";
import { CodeStep, EmailStep, OTP_LENGTH, PasswordStep } from "@/components/onboarding/AccountSteps";
import type { CodePhase } from "@/components/onboarding/CodeBoxes";
import { BirthdayStep, HomeStep, NameStep, UsernameStep } from "@/components/onboarding/ProfileSteps";
import { FavoritesStep, InterestsStep } from "@/components/onboarding/TasteSteps";
import { LocationStep, WelcomeStep } from "@/components/onboarding/FinishSteps";
import { AppearanceStep } from "@/components/onboarding/AppearanceStep";
import { categoryPhotos } from "@/components/onboarding/InterestGrid";
import { LikeBurst, useLikeBurst } from "@/components/LikeHeart";
import {
  EMPTY_DRAFT, deferLocationAsk, enterApp, finishOnboarding, isOnboarded, loadDraft, saveDraft,
  suggestUsername, usernameBase, type OnboardingDraft,
} from "@/lib/onboarding";
import { nearestOsterlenTown } from "@/lib/osterlenTowns";
import { enterTabsFromBelow } from "@/lib/tabsEntrance";
import { dayKey, lastDay } from "@/lib/events";
import type { CategoryId } from "@/theme/categories";
import { useTheme } from "@/theme/ThemeProvider";

type Mode = "email" | "resume" | "reset";
type StepId =
  | "email" | "code" | "password"
  | "appearance" | "name" | "username" | "birthday" | "home" | "interests" | "favorites" | "location" | "welcome";

const PROFILE: StepId[] = ["appearance", "name", "username", "birthday", "location", "home", "interests", "favorites", "welcome"];
/** Steg utan textfält: tangentbordet åker ner när man kommer dit */
const NO_KEYBOARD = new Set<StepId>(["appearance", "birthday", "home", "interests", "favorites", "location", "welcome"]);
/** Så här länge måste man vänta mellan två koder (Supabase tillåter en i minuten) */
const RESEND_MS = 60_000;
/** Ett konto som skapades så här nyligen skapades av koden man just fick — det är nytt */
const NEW_ACCOUNT_MS = 15 * 60_000;

const FORWARD = { entering: FadeInRight.duration(300), exiting: FadeOutLeft.duration(220) };
const BACKWARD = { entering: FadeInLeft.duration(300), exiting: FadeOutRight.duration(220) };

export default function SignupScreen() {
  const params = useLocalSearchParams<{ mode?: string; email?: string; first?: string; last?: string }>();
  const mode: Mode = params.mode === "resume" || params.mode === "reset" ? params.mode : "email";
  const reset = mode === "reset";
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const { burst, show: showBurst } = useLikeBurst();
  // Sidan har glidit in klart (då får första fältet fokus och tangentbordet kommer upp)
  const navigation = useNavigation();
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const fallback = setTimeout(() => setEntered(true), 700);
    const unsubscribe = navigation.addListener("transitionEnd" as never, () => {
      clearTimeout(fallback);
      setEntered(true);
    });
    return () => { clearTimeout(fallback); unsubscribe(); };
  }, [navigation]);

  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OnboardingDraft>(() => ({
    ...EMPTY_DRAFT, firstName: params.first ?? "", lastName: params.last ?? "",
  }));
  const [ready, setReady] = useState(mode !== "resume");
  const [step, setStep] = useState<StepId>(mode === "resume" ? "appearance" : "email");
  const [forward, setForward] = useState(true);
  const [locationNeeded, setLocationNeeded] = useState(true);

  // Kontots steg
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [codePhase, setCodePhase] = useState<CodePhase>("typing");
  // Var man är just nu: orten på Österlen närmast, eller orten man är i om det är någon annanstans
  const [nearTown, setNearTown] = useState<string | null>(null);
  const [awayCity, setAwayCity] = useState<string | null>(null);
  const suggestHome = useCallback(async () => {
    try {
      const pos = await Location.getLastKnownPositionAsync()
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!pos) return;
      const town = nearestOsterlenTown(pos.coords.latitude, pos.coords.longitude);
      if (town) {
        setNearTown(town);
        return;
      }
      const [place] = await Location.reverseGeocodeAsync(pos.coords);
      const city = place?.city || place?.subregion || null;
      if (city) setAwayCity(city);
    } catch {
      // Ingen position: man väljer orten själv
    }
  }, []);

  // ── Start: vem man är, vad man fyllt i förut och om platsfrågan behövs ──
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const id = session?.user.id ?? null;
      if (!alive) return;
      setUserId(id);
      if (mode !== "resume" || !id) {
        setReady(true);
        return;
      }
      const saved = await loadDraft(id);
      const meta = (session?.user.user_metadata ?? {}) as Record<string, string | undefined>;
      const [metaFirst = "", ...metaRest] = String(meta.full_name ?? meta.name ?? "").trim().split(/\s+/);
      if (!alive) return;
      setDraft((d) => {
        const base = saved ?? d;
        return {
          ...base,
          firstName: base.firstName || params.first || meta.given_name || metaFirst,
          lastName: base.lastName || params.last || meta.family_name || metaRest.join(" "),
        };
      });
      const savedStep = saved?.step as StepId | null | undefined;
      if (savedStep && (PROFILE.includes(savedStep) || (savedStep === "password" && saved?.needsPassword))) setStep(savedStep);
      else if (saved?.needsPassword) setStep("password");
      setReady(true);
    })();
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (!alive) return;
        setLocationNeeded(p.status !== "granted" && p.canAskAgain);
        if (p.status === "granted") suggestHome();
      })
      .catch(() => alive && setLocationNeeded(false));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stegen på den här vägen
  const path = useMemo<StepId[]>(() => {
    const profile = PROFILE.filter((id) => id !== "location" || locationNeeded);
    if (mode === "reset") return ["email", "code", "password"];
    if (mode === "email") return ["email", "code", "password", ...profile];
    return [...(draft.needsPassword ? (["password"] as StepId[]) : []), ...profile];
  }, [mode, locationNeeded, draft.needsPassword]);

  const counted = path.filter((id) => id !== "welcome").length;
  const index = Math.max(0, path.indexOf(step));
  const progress = step === "welcome" ? 1 : (index + 1) / (counted + 1);

  // Det man fyllt i sparas i telefonen (bara när man är inloggad), en kort stund efter att man
  // slutat skriva — och direkt när man byter steg
  const savedStep = useRef<StepId | null>(null);
  useEffect(() => {
    if (!userId || !ready || mode === "reset" || step === "email" || step === "code") return;
    const changedStep = savedStep.current !== step;
    savedStep.current = step;
    if (changedStep) {
      saveDraft(userId, { ...draft, step });
      return;
    }
    const timer = setTimeout(() => saveDraft(userId, { ...draft, step }), 600);
    return () => clearTimeout(timer);
  }, [userId, ready, mode, step, draft]);

  // ── Platserna (för orterna, kategoriernas foton och favoriterna) ──
  const placesQuery = usePlaces();
  const places = useMemo(() => (userId ? placesQuery.data ?? [] : []), [userId, placesQuery.data]);
  const placesLoading = !userId || !placesQuery.isFetched || (placesQuery.isFetching && places.length === 0);
  const photos = useMemo(() => categoryPhotos(places), [places]);
  useEffect(() => {
    const urls = Object.values(photos).filter((u): u is string => !!u);
    if (urls.length > 0) ExpoImage.prefetch(urls).catch(() => {});
  }, [photos]);
  // Siffrorna under välkomsten (bara det som faktiskt finns i appen)
  const offersQuery = useOffers();
  const eventsQuery = useEvents();
  const stats = useMemo(() => {
    if (!userId) return [];
    const today = dayKey(new Date());
    const upcoming = (eventsQuery.data ?? []).filter((e) => (lastDay(e) ?? "") >= today).length;
    return [
      { label: t("onboarding.done.stats.places"), count: places.length },
      { label: t("onboarding.done.stats.offers"), count: offersQuery.data?.length ?? 0 },
      { label: t("onboarding.done.stats.events"), count: upcoming },
    ];
  }, [userId, places.length, offersQuery.data, eventsQuery.data, t]);

  // ── Att gå mellan stegen ──
  const lastGo = useRef(0);
  const go = useCallback((next: StepId, ahead = true) => {
    // Ett dubbeltryck ska inte hoppa över ett steg
    const at = Date.now();
    if (at - lastGo.current < 350) return;
    lastGo.current = at;
    setError(null);
    setInfo(null);
    if (NO_KEYBOARD.has(next)) Keyboard.dismiss();
    setForward(ahead);
    setStep(next);
  }, []);
  const nextStep = useCallback(() => {
    const i = path.indexOf(step);
    if (i >= 0 && i < path.length - 1) go(path[i + 1]);
  }, [path, step, go]);

  const confirmCancel = useCallback(() => {
    Alert.alert(t("auth.cancel.title"), t("auth.cancel.body"), [
      { text: t("auth.cancel.stay"), style: "cancel" },
      // Utloggningen tar en tillbaka till startsidan (rotlayouten)
      { text: t("auth.cancel.confirm"), style: "destructive", onPress: () => { supabase.auth.signOut().catch(() => {}); } },
    ]);
  }, [t]);

  const firstSignedIn: StepId = reset ? "password" : draft.needsPassword ? "password" : "appearance";
  const back = useMemo<(() => void) | null>(() => {
    if (step === "welcome" || !ready) return null;
    if (step === "email") return () => router.back();
    if (step === "code") return () => { setCode(""); setCodePhase("typing"); go("email", false); };
    if (step === firstSignedIn || step === "password") return confirmCancel;
    const i = path.indexOf(step);
    const previous = path.slice(0, i).reverse().find((id) => id !== "password" || draft.needsPassword);
    return previous ? () => go(previous, false) : confirmCancel;
  }, [step, ready, firstSignedIn, path, draft.needsPassword, go, confirmCancel]);

  // Androids tillbaka-knapp gör samma sak som pilen
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      backRef.current?.();
      return true;
    });
    return () => sub.remove();
  }, []);

  // ── E-post och koden ──
  const otpError = useCallback((e: AuthError) => {
    const msg = (e.message ?? "").toLowerCase();
    if (e.status === 429 || msg.includes("rate limit") || msg.includes("security purposes")) return t("onboarding.email.rateLimit");
    if (reset && (msg.includes("signups not allowed") || msg.includes("not found") || e.code === "otp_disabled")) return t("onboarding.email.noAccount");
    if (msg.includes("email") && (msg.includes("invalid") || msg.includes("validate"))) return t("onboarding.email.invalid");
    return t("onboarding.email.failed");
  }, [t, reset]);

  const sendCode = useCallback(async (again = false) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: !reset } });
    setBusy(false);
    if (e) {
      setError(otpError(e));
      return;
    }
    setResendAt(Date.now() + RESEND_MS);
    setNow(Date.now());
    if (again) {
      setCode("");
      setInfo(t("onboarding.code.sent"));
    } else {
      go("code");
    }
  }, [busy, email, reset, otpError, t, go]);

  // Nedräkningen till "Skicka en ny kod"
  useEffect(() => {
    if (step !== "code" || now >= resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step, now, resendAt]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const verify = useCallback(async (token: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    setCodePhase("checking");
    const { data, error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (e || !data.user) {
      setBusy(false);
      setCode("");
      // Utan nät, eller för många försök: koden kan vara rätt, så rutorna skakar inte
      const offline = !e || e.status === 0 || /fetch|network/i.test(e.message ?? "");
      if (offline || e.status === 429) {
        setCodePhase("typing");
        setError(t(offline ? "onboarding.code.offline" : "onboarding.code.tooMany"));
        return;
      }
      setCodePhase("wrong");
      setError(t("onboarding.code.wrong"));
      setTimeout(() => setCodePhase((p) => (p === "wrong" ? "typing" : p)), 1000);
      return;
    }
    const id = data.user.id;
    setUserId(id);
    // Platserna, erbjudandena och evenemangen kunde inte hämtas innan man var inloggad
    for (const key of ["places", "offers", "events"]) queryClient.invalidateQueries({ queryKey: [key] });
    // Fanns kontot redan (inte skapat av koden nyss) och är det klart: rakt in
    const createdNow = Date.now() - new Date(data.user.created_at).getTime() < NEW_ACCOUNT_MS;
    if (!reset && !createdNow && (await isOnboarded(id))) {
      afterCode.current = () => router.replace("/(tabs)");
    } else {
      setDraft((d) => ({ ...d, needsPassword: true }));
      afterCode.current = () => go("password");
    }
    setBusy(false);
    // Rutorna glider ihop; sedan går flödet vidare (codeShown)
    setCodePhase("ok");
  }, [email, reset, t, go]);
  const afterCode = useRef<(() => void) | null>(null);
  const codeShown = useCallback(() => {
    const next = afterCode.current;
    afterCode.current = null;
    next?.();
  }, []);

  const changeCode = useCallback((value: string) => {
    // Medan koden kontrolleras står rutorna still
    if (busy || codePhase === "checking" || codePhase === "ok") return;
    if (codePhase === "wrong") setCodePhase("typing");
    setCode(value);
    if (error) setError(null);
    if (value.length === OTP_LENGTH) verify(value);
  }, [busy, codePhase, error, verify]);

  // ── Lösenordet ──
  const savePassword = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) {
      const msg = (e.message ?? "").toLowerCase();
      if (e.code === "same_password" || msg.includes("different from the old")) setError(t("onboarding.password.same"));
      else if (e.code === "weak_password" || msg.includes("weak")) setError(t("onboarding.password.weak"));
      else setError(t("onboarding.password.failed"));
      return;
    }
    setPassword("");
    if (reset) {
      await enterApp();
      return;
    }
    setDraft((d) => ({ ...d, needsPassword: false }));
    go("appearance");
  }, [password, reset, t, go]);

  // ── Profilen ──
  // Förslaget på användarnamn följer namnet, tills man skrivit ett eget
  const suggested = useRef("");
  const submitName = useCallback(() => {
    const { firstName, lastName, username } = draft;
    if (!username || username === suggested.current) {
      const quick = usernameBase(firstName, lastName);
      if (quick.length >= 3) {
        suggested.current = quick;
        setDraft((d) => ({ ...d, username: quick }));
      }
      suggestUsername(firstName, lastName).then((name) => {
        if (!name) return;
        setDraft((d) => {
          if (d.username !== suggested.current) return d;
          suggested.current = name;
          return { ...d, username: name };
        });
      }).catch(() => {});
    }
    nextStep();
  }, [draft, nextStep]);

  const toggleInterest = useCallback((id: CategoryId) => {
    setDraft((d) => ({ ...d, interests: d.interests.includes(id) ? d.interests.filter((x) => x !== id) : [...d.interests, id] }));
  }, []);
  const toggleFavorite = useCallback((placeId: number) => {
    setDraft((d) => ({ ...d, favorites: d.favorites.includes(placeId) ? d.favorites.filter((x) => x !== placeId) : [...d.favorites, placeId] }));
  }, []);

  // ── Platsen ──
  const allowLocation = useCallback(async () => {
    setBusy(true);
    const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
    setBusy(false);
    if (perm?.status === "granted") suggestHome();
    nextStep();
  }, [nextStep, suggestHome]);
  const laterLocation = useCallback(() => {
    deferLocationAsk();
    nextStep();
  }, [nextStep]);

  // ── Klart: allt sparas när välkomsten visas ──
  const [saving, setSaving] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const [startPressed, setStartPressed] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const finish = useCallback(async () => {
    if (!userId) return;
    setSaving("saving");
    const result = await finishOnboarding(userId, draftRef.current);
    if (result === "username_taken") {
      setSaving("idle");
      setStartPressed(false);
      setUsernameError(t("onboarding.done.usernameTaken"));
      lastGo.current = 0;
      go("username", false);
      return;
    }
    setSaving(result ? "failed" : "done");
  }, [userId, t, go]);
  useEffect(() => {
    if (step === "welcome" && saving === "idle") finish();
  }, [step, saving, finish]);
  useEffect(() => {
    if (!startPressed || saving !== "done") return;
    // Hem glider upp underifrån medan välkomsten glider undan uppåt — som att låsa upp telefonen
    enterTabsFromBelow();
    setLeaving(true);
    router.replace("/(tabs)");
  }, [startPressed, saving]);
  const [leaving, setLeaving] = useState(false);
  const start = useCallback(() => {
    if (saving === "failed") {
      finish();
      return;
    }
    setStartPressed(true);
  }, [saving, finish]);

  // ── Stegen ──
  const set = useCallback((changes: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...changes })), []);
  let content: ReactNode = null;
  switch (step) {
    case "email":
      content = <EmailStep ready={entered} email={email} onChange={(v) => { setEmail(v); setError(null); }} onSubmit={() => sendCode()} busy={busy} error={error} reset={reset} />;
      break;
    case "code":
      content = (
        <CodeStep
          email={email.trim()}
          code={code}
          onChange={changeCode}
          phase={codePhase}
          onOkShown={codeShown}
          error={error}
          info={info}
          resendIn={resendIn}
          onResend={() => sendCode(true)}
          onChangeEmail={() => { setCode(""); setCodePhase("typing"); go("email", false); }}
        />
      );
      break;
    case "password":
      content = <PasswordStep password={password} onChange={(v) => { setPassword(v); setError(null); }} onSubmit={savePassword} busy={busy} error={error} reset={reset} />;
      break;
    case "appearance":
      content = <AppearanceStep onSubmit={nextStep} />;
      break;
    case "name":
      content = <NameStep first={draft.firstName} last={draft.lastName} onChange={(firstName, lastName) => set({ firstName, lastName })} onSubmit={submitName} />;
      break;
    case "username":
      content = (
        <UsernameStep
          username={draft.username}
          onChange={(username) => { set({ username }); setUsernameError(null); }}
          onSubmit={nextStep}
          error={usernameError}
        />
      );
      break;
    case "birthday":
      content = <BirthdayStep value={draft.birthDate} onChange={(birthDate) => set({ birthDate })} onSubmit={nextStep} />;
      break;
    case "home":
      content = <HomeStep lives={draft.livesInOsterlen} city={draft.city} near={nearTown} away={awayCity} onChange={(livesInOsterlen, city) => set({ livesInOsterlen, city })} onSubmit={nextStep} />;
      break;
    case "interests":
      content = <InterestsStep selected={draft.interests} onToggle={toggleInterest} photos={photos} loading={placesLoading} onSubmit={nextStep} />;
      break;
    case "favorites":
      content = (
        <FavoritesStep
          places={places}
          loading={placesLoading}
          interests={draft.interests}
          selected={draft.favorites}
          onToggle={toggleFavorite}
          onBurst={showBurst}
          onSubmit={nextStep}
        />
      );
      break;
    case "location":
      content = <LocationStep busy={busy} onAllow={allowLocation} onLater={laterLocation} />;
      break;
    case "welcome":
      // Välkomsten ligger som ett eget lager (nedan), byggt i förväg
      content = null;
      break;
  }

  // Välkomsten byggs två steg innan (en stund efter att det steget visats), så kortets bilder hunnit
  // laddas och inget ritas medan något rör sig
  const welcomeAt = path.indexOf("welcome");
  const nearWelcome = welcomeAt > 0 && index >= welcomeAt - 2;
  const [welcomeMounted, setWelcomeMounted] = useState(false);
  useEffect(() => {
    if (!nearWelcome || welcomeMounted) return;
    const timer = setTimeout(() => setWelcomeMounted(true), step === "welcome" ? 0 : 500);
    return () => clearTimeout(timer);
  }, [nearWelcome, welcomeMounted, step]);

  const motion = forward ? FORWARD : BACKWARD;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Startsidan under har ljus text över fotot; här följer den temat (välkomsten har ett eget foto) */}
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      {step !== "welcome" ? (
        <View style={{ paddingTop: insets.top }}>
          <StepBar progress={progress} onBack={back} />
        </View>
      ) : null}
      {/* Tangentbordet: varje steg lyfter sina knappar själv (StepLayout) */}
      <View style={{ flex: 1 }}>
        {ready ? (
          <Reanimated.View key={step} style={{ flex: 1 }} entering={motion.entering} exiting={motion.exiting}>
            {content}
          </Reanimated.View>
        ) : null}
      </View>
      {welcomeMounted ? (
        <WelcomeStep
          visible={step === "welcome"}
          leaving={leaving}
          firstName={draft.firstName}
          displayName={`${draft.firstName.trim()} ${draft.lastName.trim()}`.trim()}
          saved={saving === "done" || saving === "failed"}
          saving={startPressed && saving === "saving"}
          failed={saving === "failed"}
          stats={stats}
          onStart={start}
        />
      ) : null}
      <LikeBurst burst={burst} />
    </View>
  );
}
