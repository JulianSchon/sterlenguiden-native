/**
 * Svenska — källan till alla texter. Engelska och tyska (en.ts, de.ts) måste
 * ha exakt samma nycklar; TypeScript klagar om något saknas. Lägg nya texter
 * här först, översätt sedan.
 */
export const sv = {
  common: {
    back: "Tillbaka",
    cancel: "Avbryt",
    save: "Spara",
    saved: "Sparat",
    done: "Klar",
    close: "Stäng",
    ok: "OK",
    error: "Något gick fel",
    tryAgain: "Försök igen",
  },
  settings: {
    title: "Inställningar",
    sections: {
      account: "Konto",
      pass: "Österlenpasset",
      appearance: "Utseende",
      notifications: "Notiser",
      about: "Om",
    },
    language: "Språk",
    suggest: {
      title: "Saknas ditt smultronställe?",
      subtitle: "Tipsa oss om platser och upplevelser på Österlen.",
    },
    signOut: { action: "Logga ut", title: "Logga ut", message: "Är du säker?" },
    deleteAccount: {
      action: "Radera konto",
      title: "Radera konto",
      message: "All din data raderas permanent. Detta kan inte ångras.",
      confirm: "Radera permanent",
    },
  },
  appearance: {
    title: "Utseende",
    theme: "Tema",
    themeSystem: "Följ systemet",
    themeLight: "Ljust",
    themeDark: "Mörkt",
    cardDesign: "Kortdesign",
  },
};
