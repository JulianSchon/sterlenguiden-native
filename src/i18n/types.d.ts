import "i18next";
import type { sv } from "./locales/sv";

// Gör att t("...") bara accepterar nycklar som finns i svenska texterna
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof sv };
  }
}
