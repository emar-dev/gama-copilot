/**
 * Lecture structurelle d'un modèle GAML : espèces, attributs, réflexes, expériences,
 * paramètres et effectifs initiaux. Ce n'est pas un compilateur (gama-server reste
 * la référence) : c'est une lecture rapide pour présenter le modèle dans l'interface.
 */

export interface GamlAttribute {
  type: string;
  name: string;
  initial: string | null;
}

export interface GamlSpecies {
  name: string;
  kind: 'species' | 'grid';
  parent: string | null;
  skills: string[];
  attributes: GamlAttribute[];
  reflexes: string[];
  actions: string[];
  aspects: string[];
  /** Nombre d'agents créés dans init (nombre littéral ou variable globale résolue), si connu. */
  initialCount: number | null;
}

export interface GamlExperiment {
  name: string;
  type: string;
  parameters: { label: string; variable: string }[];
  displays: string[];
}

export interface GamlSummary {
  model: string | null;
  lines: number;
  globals: GamlAttribute[];
  species: GamlSpecies[];
  experiments: GamlExperiment[];
}

const TYPES =
  'int|float|bool|string|point|geometry|list|map|matrix|pair|rgb|date|file|agent|container|graph|path|topology|unknown|species|image';
const ATTRIBUTE_RE = new RegExp(
  String.raw`^\s*((?:${TYPES})(?:<[^>]*>)?|[A-Z]\w*)\s+([A-Za-z_]\w*)\s*(?:<-\s*([^;{]+?)\s*)?(?:;|\b(?:update|min|max|among|const|function)\b)`,
  'gm',
);

/** Retire commentaires et contenu des chaînes (remplacé par des espaces, positions conservées). */
function stripNoise(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(
      /"(?:[^"\\\n]|\\.)*"/g,
      (m) => `"${' '.repeat(Math.max(0, m.length - 2))}"`,
    )
    .replace(
      /'(?:[^'\\\n]|\\.)*'/g,
      (m) => `'${' '.repeat(Math.max(0, m.length - 2))}'`,
    );
}

/** Corps entre l'accolade ouvrante à `openIndex` et sa fermante correspondante. */
function blockAt(
  code: string,
  openIndex: number,
): { body: string; end: number } {
  let depth = 0;
  for (let i = openIndex; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return { body: code.slice(openIndex + 1, i), end: i };
    }
  }
  return { body: code.slice(openIndex + 1), end: code.length };
}

/** Partie d'un bloc située à profondeur 0 (hors sous-blocs), pour lire ses déclarations directes. */
function topLevel(body: string): string {
  let depth = 0;
  let out = '';
  for (const c of body) {
    if (c === '{') depth++;
    if (depth === 0) out += c;
    else out += c === '\n' ? '\n' : ' ';
    if (c === '}') depth--;
  }
  return out;
}

function attributesOf(body: string): GamlAttribute[] {
  const result: GamlAttribute[] = [];
  const reserved = new Set([
    'reflex',
    'action',
    'aspect',
    'init',
    'do',
    'ask',
    'create',
    'return',
    'if',
    'else',
    'loop',
    'write',
    'species',
    'grid',
    'experiment',
    'parameter',
    'output',
    'display',
  ]);
  for (const m of topLevel(body).matchAll(ATTRIBUTE_RE)) {
    const [, type, name, initial] = m;
    if (reserved.has(type) || reserved.has(name)) continue;
    result.push({ type, name, initial: initial?.trim() ?? null });
  }
  return result;
}

function namesOf(body: string, keyword: string): string[] {
  const re = new RegExp(String.raw`\b${keyword}\s+([A-Za-z_]\w*)`, 'g');
  return [...topLevel(body).matchAll(re)].map((m) => m[1]);
}

function facetList(header: string, facet: string): string[] {
  const m = new RegExp(String.raw`\b${facet}\s*:\s*\[([^\]]*)\]`).exec(header);
  return m
    ? m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function resolveCount(expr: string, globals: GamlAttribute[]): number | null {
  const literal = Number(expr);
  if (Number.isFinite(literal)) return literal;
  const global = globals.find((g) => g.name === expr);
  const value = global?.initial ? Number(global.initial) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function summarizeGaml(source: string): GamlSummary {
  const code = stripNoise(source);
  const model = /^\s*model\s+([A-Za-z_]\w*)/m.exec(code)?.[1] ?? null;

  let globals: GamlAttribute[] = [];
  let globalBody = '';
  const globalMatch = /\bglobal\b[^{;]*\{/.exec(code);
  if (globalMatch) {
    globalBody = blockAt(
      code,
      globalMatch.index + globalMatch[0].length - 1,
    ).body;
    globals = attributesOf(globalBody);
  }

  // Effectifs créés : « create espece number: N » (dans global/init le plus souvent).
  const created = new Map<string, number | null>();
  for (const m of code.matchAll(
    /\bcreate\s+([A-Za-z_]\w*)\s+number\s*:\s*([A-Za-z_]\w*|\d+)/g,
  )) {
    if (!created.has(m[1])) created.set(m[1], resolveCount(m[2], globals));
  }

  const species: GamlSpecies[] = [];
  for (const m of code.matchAll(
    /\b(species|grid)\s+([A-Za-z_]\w*)([^{;]*)\{/g,
  )) {
    const [, kind, name, header] = m;
    const { body } = blockAt(code, (m.index ?? 0) + m[0].length - 1);
    const width = /\bwidth\s*:\s*(\d+)/.exec(header)?.[1];
    const height = /\bheight\s*:\s*(\d+)/.exec(header)?.[1];
    species.push({
      name,
      kind: kind as 'species' | 'grid',
      parent: /\bparent\s*:\s*([A-Za-z_]\w*)/.exec(header)?.[1] ?? null,
      skills: facetList(header, 'skills'),
      attributes: attributesOf(body),
      reflexes: namesOf(body, 'reflex'),
      actions: namesOf(body, 'action'),
      aspects: namesOf(body, 'aspect'),
      initialCount:
        kind === 'grid' && width && height
          ? Number(width) * Number(height)
          : (created.get(name) ?? null),
    });
  }

  const experiments: GamlExperiment[] = [];
  // Lu sur le source (le nom peut être une chaîne), en ignorant ce qui tombe dans un commentaire.
  for (const m of source.matchAll(
    /\bexperiment\s+(?:"([^"\n]+)"|([A-Za-z_]\w*))([^{;]*)\{/g,
  )) {
    const index = m.index ?? 0;
    if (!code.startsWith('experiment', index)) continue;
    const { body } = blockAt(source, index + m[0].length - 1);
    experiments.push({
      name: (m[1] ?? m[2]).trim(),
      type: /\btype\s*:\s*([A-Za-z_]\w*)/.exec(m[3])?.[1] ?? 'gui',
      parameters: [
        ...body.matchAll(/\bparameter\s+"([^"]*)"\s+var\s*:\s*([A-Za-z_]\w*)/g),
      ].map((p) => ({
        label: p[1],
        variable: p[2],
      })),
      displays: [
        ...body.matchAll(/\bdisplay\s+"?([A-Za-z_][\w ]*?)"?(?=\s|\{)/g),
      ].map((d) => d[1].trim()),
    });
  }

  return {
    model,
    lines: source.split(/\r?\n/).length,
    globals,
    species,
    experiments,
  };
}
