import type { sv } from "./sv";

export const de: typeof sv = {
  common: {
    back: "Zurück",
    cancel: "Abbrechen",
    save: "Speichern",
    saved: "Gespeichert",
    done: "Fertig",
    close: "Schließen",
    ok: "OK",
    error: "Etwas ist schiefgelaufen",
    tryAgain: "Erneut versuchen",
  },
  settings: {
    title: "Einstellungen",
    sections: {
      account: "Konto",
      pass: "Der Österlen-Pass",
      appearance: "Darstellung",
      notifications: "Benachrichtigungen",
      about: "Über",
    },
    language: "Sprache",
    suggest: {
      title: "Fehlt dein Lieblingsort?",
      subtitle: "Verrate uns Orte und Erlebnisse in Österlen.",
    },
    signOut: { action: "Abmelden", title: "Abmelden", message: "Bist du sicher?" },
    deleteAccount: {
      action: "Konto löschen",
      title: "Konto löschen",
      message: "Alle deine Daten werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.",
      confirm: "Endgültig löschen",
    },
  },
  appearance: {
    title: "Darstellung",
    theme: "Design",
    themeSystem: "System folgen",
    themeLight: "Hell",
    themeDark: "Dunkel",
    cardDesign: "Kartendesign",
  },
};
