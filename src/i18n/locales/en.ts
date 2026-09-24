import type { sv } from "./sv";

export const en: typeof sv = {
  common: {
    back: "Back",
    cancel: "Cancel",
    save: "Save",
    saved: "Saved",
    done: "Done",
    close: "Close",
    ok: "OK",
    error: "Something went wrong",
    tryAgain: "Try again",
  },
  settings: {
    title: "Settings",
    sections: {
      account: "Account",
      pass: "The Österlen Pass",
      appearance: "Appearance",
      notifications: "Notifications",
      about: "About",
    },
    language: "Language",
    suggest: {
      title: "Is your favourite spot missing?",
      subtitle: "Tell us about places and experiences in Österlen.",
    },
    signOut: { action: "Log out", title: "Log out", message: "Are you sure?" },
    deleteAccount: {
      action: "Delete account",
      title: "Delete account",
      message: "All your data will be permanently deleted. This cannot be undone.",
      confirm: "Delete permanently",
    },
  },
  appearance: {
    title: "Appearance",
    theme: "Theme",
    themeSystem: "Follow system",
    themeLight: "Light",
    themeDark: "Dark",
    cardDesign: "Card design",
  },
};
