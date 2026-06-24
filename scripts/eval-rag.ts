import { createEmbeddings } from '../src/util/embeddings/embeddings';
import { LocalVectorStore } from '../src/util/vector/local-store';

const INDEX_PATH = process.env.INDEX_PATH ?? 'data/gama-index.json';
const TOP_K = process.env.TOP_K ? Number(process.env.TOP_K) : 5;

// Banc de questions de référence: chaque question doit faire remonter
// un passage contenant au moins un des termes attendus.
const CASES: { q: string; expect: string[] }[] = [
  { q: 'Comment définir une species en GAML ?', expect: ['species'] },
  { q: "Qu'est-ce qu'un reflex et comment l'utiliser ?", expect: ['reflex'] },
  { q: 'Comment créer un experiment pour lancer une simulation ?', expect: ['experiment'] },
  { q: 'Comment déclarer la section global du modèle ?', expect: ['global'] },
  { q: "Comment définir l'aspect d'affichage d'un agent ?", expect: ['aspect'] },
  { q: 'Comment utiliser une grille (grid) dans GAMA ?', expect: ['grid'] },
  { q: 'Comment définir une action dans une species ?', expect: ['action'] },
  { q: 'Comment parcourir des agents avec ask ?', expect: ['ask'] },
  { q: 'Comment créer des agents avec create ?', expect: ['create'] },
  { q: 'Comment afficher une carte avec display ?', expect: ['display'] },
];

function hitRank(texts: string[], expect: string[]): number {
  for (let i = 0; i < texts.length; i++) {
    const lower = texts[i].toLowerCase();
    if (expect.some((e) => lower.includes(e.toLowerCase()))) return i + 1;
  }
  return -1;
}

async function main() {
  const store = new LocalVectorStore(createEmbeddings(), INDEX_PATH);
  if (!(await store.load())) {
    throw new Error(`Index introuvable: ${INDEX_PATH}`);
  }
  console.log(`Index: ${store.size()} vecteurs | TOP_K=${TOP_K}\n`);

  let hit1 = 0;
  let hitK = 0;
  let scoreSum = 0;

  for (const c of CASES) {
    const hits = await store.search(c.q, TOP_K);
    const rank = hitRank(hits.map((h) => h.text), c.expect);
    const top = hits[0]?.score ?? 0;
    scoreSum += top;
    if (rank === 1) hit1++;
    if (rank > 0) hitK++;

    const tag = rank === 1 ? 'HIT@1' : rank > 0 ? `HIT@${rank}` : 'MISS ';
    console.log(`[${tag}] top=${top.toFixed(3)} :: ${c.q}`);
  }

  const n = CASES.length;
  console.log('\n--- RÉSULTATS ---');
  console.log(`hit@1 : ${hit1}/${n} (${((hit1 / n) * 100).toFixed(0)}%)`);
  console.log(`hit@${TOP_K} : ${hitK}/${n} (${((hitK / n) * 100).toFixed(0)}%)`);
  console.log(`score moyen (top1): ${(scoreSum / n).toFixed(3)}`);
}

main().catch((err) => {
  console.error('EVAL FAIL ->', err);
  process.exit(1);
});
