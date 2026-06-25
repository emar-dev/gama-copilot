/**
 * Correcteur déterministe de GAML.
 *
 * Les LLM (qwen2.5-coder notamment) reproduisent quelques erreurs mécaniques
 * que le compilateur GAMA ne pointe pas clairement (l'erreur se propage sur le
 * symbole suivant). On les corrige automatiquement AVANT validation pour ne pas
 * gaspiller des tentatives de réparation sur des fautes triviales.
 *
 * Volontairement conservateur : on ne touche qu'à des motifs sûrs et on évite
 * les lignes de type `with: [a::b]` où `::` (opérateur de paire) est légitime.
 */

const COLOR_NAMES = [
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'black',
  'white',
  'gray',
  'grey',
  'brown',
  'cyan',
  'magenta',
  'gold',
  'silver',
  'darkgreen',
  'darkblue',
  'lightblue',
  'lightgray',
];

const COLOR_ALT = COLOR_NAMES.join('|');

/** Une ligne contient-elle une map / un `with:` où `::` est légitime ? */
function hasMapContext(line: string): boolean {
  return /\bwith\s*:/.test(line) || /\[[^\]]*::/.test(line);
}

function fixColors(line: string): string {
  if (hasMapContext(line)) return line;
  // `color::green` -> `color: green`
  let out = line.replace(/\bcolor\s*::\s*/g, 'color: ');
  // `color: green` ou `color: #green` -> `color: #green`
  out = out.replace(
    new RegExp(`\\bcolor\\s*:\\s*#?\\s*(${COLOR_ALT})\\b`, 'gi'),
    (_m, name: string) => `color: #${name.toLowerCase()}`,
  );
  return out;
}

function fixEmpty(line: string): string {
  // `empty?(x)` -> `empty(x)` (parenthèses déjà présentes)
  let out = line.replace(/\bempty\?\s*\(\s*([A-Za-z_]\w*)\s*\)/g, 'empty($1)');
  // `empty? x` -> `empty(x)` (sans parenthèses ; ne pas avaler une `)` voisine)
  out = out.replace(/\bempty\?\s*([A-Za-z_]\w*)/g, 'empty($1)');
  return out;
}

function fixCreateCount(line: string): string {
  if (!/\bcreate\b/.test(line)) return line;
  // `create X count: N` -> `create X number: N`
  return line.replace(/\bcount\s*:/g, 'number:');
}

function fixAskDie(line: string): string {
  // `ask cible die;` -> `ask cible { do die; }`
  return line.replace(/\bask\s+([A-Za-z_][\w.]*)\s+die\s*;/g, 'ask $1 { do die; }');
}

export function normalizeGaml(code: string): string {
  if (!code) return code;
  return code
    .split('\n')
    .map((line) => {
      let out = line;
      out = fixColors(out);
      out = fixEmpty(out);
      out = fixCreateCount(out);
      out = fixAskDie(out);
      return out;
    })
    .join('\n');
}
