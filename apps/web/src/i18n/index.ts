import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ru } from "./ru";
import { en } from "./en";

const STORAGE_KEY = "spyapp.lang";

function initialLanguage(): "ru" | "en" {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    // localStorage может быть недоступен (приватный режим)
  }
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // см. выше
  }
});

export default i18n;
