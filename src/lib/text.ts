/** "Ōtāhuhu" → "Otahuhu". Strips combining diacritics (macrons, accents). */
export const foldDiacritics = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Ōtāhuhu" → "otahuhu", "Taranaki-King Country" → "taranaki-king-country". */
export const slugify = (s: string) =>
  foldDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
