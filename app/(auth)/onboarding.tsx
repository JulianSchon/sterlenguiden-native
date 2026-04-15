import { useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ImageBackground,
  ViewToken,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

const SLIDES = [
  {
    id: "1",
    image: require("@/assets/onboarding-1.jpg"),
    title: "Österlen",
    subtitle: "Upptäck Skånes pärla",
  },
  {
    id: "2",
    image: require("@/assets/onboarding-1.jpg"), // replace with onboarding-2.jpg when ready
    title: "Platser",
    subtitle: "Hitta dolda pärlor och lokala favoriter",
  },
  {
    id: "3",
    image: require("@/assets/onboarding-1.jpg"), // replace with onboarding-3.jpg when ready
    title: "Upplev",
    subtitle: "Evenemang, mat och natur året runt",
  },
];

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setActiveIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
    } else {
      router.replace("/(auth)/login");
    }
  };

  const skip = () => {
    router.replace("/(auth)/login");
  };

  return (
    <View style={s.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <ImageBackground source={item.image} style={s.slide} resizeMode="cover">
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.75)"]}
              locations={[0.3, 0.65, 1]}
              style={s.gradient}
            />
            <View style={s.textContainer}>
              <Text style={s.title}>{item.title}</Text>
              <Text style={s.subtitle}>{item.subtitle}</Text>
            </View>
          </ImageBackground>
        )}
      />

      {/* Bottom controls */}
      <SafeAreaView edges={["bottom"]} style={s.controls}>
        {/* Dots */}
        <View style={s.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[s.dot, i === activeIndex && s.dotActive]} />
          ))}
        </View>

        {/* Skip & Next */}
        <View style={s.buttons}>
          {activeIndex < SLIDES.length - 1 ? (
            <TouchableOpacity onPress={skip} style={s.skipBtn}>
              <Text style={s.skipText}>Hoppa över</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}

          <TouchableOpacity onPress={goNext} style={s.nextBtn}>
            <Text style={s.nextText}>
              {activeIndex === SLIDES.length - 1 ? "Kom igång" : "›"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  slide: {
    width,
    height,
    justifyContent: "flex-end",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  textContainer: {
    paddingHorizontal: 32,
    paddingBottom: 160,
    alignItems: "center",
  },
  title: {
    fontSize: 48,
    fontWeight: "300",
    color: "#FFFFFF",
    letterSpacing: 2,
    textAlign: "center",
    fontStyle: "italic",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: 8,
    letterSpacing: 0.5,
    fontWeight: "300",
  },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    width: 20,
    backgroundColor: "#FFFFFF",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  skipBtn: {
    padding: 12,
  },
  skipText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "300",
  },
  nextBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  nextText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "300",
  },
});
