/**
 * Vädret just nu, till raden under hälsningen på Hem ("12° · Halvklart i Simrishamn").
 *
 * Från Open-Meteo (öppen vädertjänst, ingen nyckel eller konto). Bara en ungefärlig position
 * skickas: avrundad till en decimal (ungefär 10 km), aldrig var man faktiskt står. Hämtas om högst
 * var 20:e minut. Går det inte att hämta visas bara inget väder.
 */
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react-native";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun,
} from "lucide-react-native";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

export interface Weather {
  /** Grader, avrundat */
  temp: number;
  kind: WeatherKind;
  /** "Klart", "Halvklart", "Regn" … */
  label: string;
  isDay: boolean;
  /** Meter per sekund */
  wind: number;
}

/** WMO-koden (Open-Meteo) som ett ord och en sort */
function describe(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: "clear", label: "Klart" };
  if (code === 1) return { kind: "partly", label: "Mestadels klart" };
  if (code === 2) return { kind: "partly", label: "Halvklart" };
  if (code === 3) return { kind: "cloudy", label: "Mulet" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Dimma" };
  if (code >= 51 && code <= 57) return { kind: "drizzle", label: "Duggregn" };
  if (code === 65 || code === 82) return { kind: "rain", label: "Kraftigt regn" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 81)) return { kind: "rain", label: code >= 80 ? "Regnskurar" : "Regn" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", label: code >= 85 ? "Snöbyar" : "Snö" };
  if (code >= 95) return { kind: "thunder", label: "Åska" };
  return { kind: "cloudy", label: "Mulet" };
}

export function weatherIcon(w: Weather): LucideIcon {
  switch (w.kind) {
    case "clear": return w.isDay ? Sun : Moon;
    case "partly": return w.isDay ? CloudSun : CloudMoon;
    case "fog": return CloudFog;
    case "drizzle": return CloudDrizzle;
    case "rain": return CloudRain;
    case "snow": return CloudSnow;
    case "thunder": return CloudLightning;
    default: return Cloud;
  }
}

/** Ungefär en mil — positionen som skickas säger aldrig var man faktiskt står */
const coarse = (v: number) => Math.round(v * 10) / 10;

export function useWeather(lat: number, lng: number) {
  const la = coarse(lat);
  const ln = coarse(lng);
  return useQuery({
    queryKey: ["weather", la, ln],
    staleTime: 20 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<Weather> => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}`
        + "&current=temperature_2m,weather_code,is_day,wind_speed_10m&wind_speed_unit=ms&timezone=Europe%2FStockholm";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`weather ${res.status}`);
      const json = await res.json() as {
        current?: { temperature_2m: number; weather_code: number; is_day: number; wind_speed_10m: number };
      };
      const c = json.current;
      if (!c) throw new Error("weather empty");
      return { temp: Math.round(c.temperature_2m), ...describe(c.weather_code), isDay: c.is_day === 1, wind: c.wind_speed_10m };
    },
  });
}
