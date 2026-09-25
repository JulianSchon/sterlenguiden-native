import { useTranslation } from "react-i18next";

/** Visningsnamn för en passperiod på användarens språk ("month" → "1 månad"). Okända id:n visas som de är. */
export function usePeriodLabel() {
  const { t } = useTranslation();
  const labels = {
    week: t("pass.periods.week"),
    month: t("pass.periods.month"),
    quarter: t("pass.periods.quarter"),
    summer: t("pass.periods.summer"),
    year: t("pass.periods.year"),
  } as Record<string, string>;
  return (period: string | null | undefined) => (period ? labels[period] ?? period : "");
}
