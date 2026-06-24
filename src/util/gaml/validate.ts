export interface GamlValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Retire commentaires (// et /* */) et littéraux de chaîne pour ne pas
// fausser le comptage des délimiteurs.
function stripNoise(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    const c = code[i];
    const next = code[i + 1];

    if (c === '/' && next === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function checkBalanced(code: string, open: string, close: string, label: string): string | null {
  let depth = 0;
  for (const ch of code) {
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth < 0) return `${label} fermant '${close}' en trop`;
    }
  }
  if (depth > 0) return `${depth} ${label} '${open}' non fermé(s)`;
  return null;
}

/**
 * Validation syntaxique basique d'un modèle GAML (J12).
 * Vérifie l'équilibre des délimiteurs et la présence des blocs structurants.
 */
export function validateGaml(code: string): GamlValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!code || !code.trim()) {
    return { valid: false, errors: ['Code vide'], warnings };
  }

  const clean = stripNoise(code);

  for (const [o, c, label] of [
    ['{', '}', 'accolade'],
    ['(', ')', 'parenthèse'],
    ['[', ']', 'crochet'],
  ] as const) {
    const err = checkBalanced(clean, o, c, label);
    if (err) errors.push(err);
  }

  if (!/^\s*model\s+\w+/m.test(clean)) {
    errors.push("En-tête manquant : un modèle doit commencer par 'model <Nom>'");
  }
  if (!/\bglobal\s*\{/.test(clean)) {
    warnings.push("Bloc 'global { }' absent");
  }
  if (!/\bspecies\s+\w+/.test(clean)) {
    warnings.push("Aucune 'species' déclarée");
  }
  if (!/\bexperiment\s+\w+/.test(clean)) {
    warnings.push("Bloc 'experiment' absent (nécessaire pour exécuter le modèle)");
  }

  return { valid: errors.length === 0, errors, warnings };
}
