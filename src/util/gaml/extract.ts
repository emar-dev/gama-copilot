/**
 * Extrait le code GAML d'une réponse LLM.
 * Privilégie un bloc ```gaml / ```gama, sinon le premier bloc ```...```,
 * sinon retourne le texte brut nettoyé.
 */
export function extractGaml(text: string): string {
  if (!text) return '';

  const fenced = text.match(/```(?:gaml|gama)?\s*\n?([\s\S]*?)```/i);
  if (fenced && fenced[1].trim()) {
    return fenced[1].trim();
  }

  return text.trim();
}
