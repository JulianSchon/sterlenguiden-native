/**
 * Kartans utseende: svartvit, i appens tema (mörk i mörkt läge, ljus i ljust). Det enda som har
 * färg på kartan är Österlens platser — nålarna i kategoriernas färger.
 *
 * Google Kartor går att styla helt (stilarna nedan: bara gråskala, inga egna affärer/restauranger,
 * ingen kollektivtrafik), så både iPhone och Android använder Google. Nycklarna kommer från EAS
 * när appen byggs (app.config.js). Sätts GOOGLE_MAPS_ON_IOS till false används Apple Kartor på
 * iPhone — de kan bara göras mörka och dämpade, inte helt svartvita.
 */
import { Platform } from "react-native";
import { PROVIDER_DEFAULT, PROVIDER_GOOGLE, type MapStyleElement } from "react-native-maps";

/** Google Kartor även på iPhone (kräver Google Maps-nyckeln i bygget, se app.config.js) */
export const GOOGLE_MAPS_ON_IOS = true;

export const MAP_PROVIDER = Platform.OS === "ios" && !GOOGLE_MAPS_ON_IOS ? PROVIDER_DEFAULT : PROVIDER_GOOGLE;
/** Stilarna gäller bara Google-kartan */
export const MAP_IS_STYLEABLE = MAP_PROVIDER === PROVIDER_GOOGLE;

const hidden = [{ visibility: "off" }];

/** Gemensamt: inga ikoner, inga egna platser, ingen kollektivtrafik */
const BASE: MapStyleElement[] = [
  { elementType: "labels.icon", stylers: hidden },
  { featureType: "poi", stylers: hidden },
  { featureType: "transit", stylers: hidden },
  { featureType: "road", elementType: "labels.icon", stylers: hidden },
];

export const DARK_MAP_STYLE: MapStyleElement[] = [
  ...BASE,
  { elementType: "geometry", stylers: [{ color: "#1b1b1b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8c8c8c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1b1b1b" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#b4b4b4" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#1f1f1f" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d2d2d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7a7a7a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3b3b3b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0d0d0d" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4d4d4d" }] },
];

export const LIGHT_MAP_STYLE: MapStyleElement[] = [
  ...BASE,
  { elementType: "geometry", stylers: [{ color: "#f4f4f4" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7a7a7a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f4f4f4" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#d6d6d6" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#4a4a4a" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9a9a9a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e2e2e2" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d9d9d9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#a0a0a0" }] },
];
