export function cleanText(text: string) {
  return text
    .replace(/\s+/g, ' ')        // espaces multiples
    .replace(/\n+/g, '\n')       // lignes multiples
    .replace(/\t/g, ' ')         // tabs
    .trim();
}