export interface Language {
  key: string;
  label: string;
  // TED/eForms field-language codes that map to this language (2-letter and
  // 3-letter ISO variants both show up in the data).
  aliases: string[];
}

export const LANGUAGES: Language[] = [
  { key: "nl", label: "Dutch", aliases: ["nl", "nld", "dut"] },
  { key: "fr", label: "French", aliases: ["fr", "fra", "fre"] },
  { key: "de", label: "German", aliases: ["de", "deu", "ger"] },
  { key: "en", label: "English", aliases: ["en", "eng"] },
];

export function languageLabels(keys: string[], t?: (key: string) => string): string[] {
  return LANGUAGES.filter((l) => keys.includes(l.key)).map((l) => {
    if (t) {
      try {
        return t(l.key);
      } catch {
        // fall through to the English default below
      }
    }
    return l.label;
  });
}
