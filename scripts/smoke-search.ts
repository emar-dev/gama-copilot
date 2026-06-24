import { createEmbeddings } from '../src/util/embeddings/embeddings';
import { LocalVectorStore } from '../src/util/vector/local-store';

const INDEX_PATH = process.env.INDEX_PATH ?? 'data/gama-index.json';

async function main() {
  const store = new LocalVectorStore(createEmbeddings(), INDEX_PATH);
  const loaded = await store.load();
  if (!loaded) {
    throw new Error(`Index introuvable: ${INDEX_PATH} (lance d'abord build-index)`);
  }
  console.log(`Index chargé: ${store.size()} vecteurs`);

  const queries = [
    'How do I define a species in GAML?',
    'How to create a reflex behavior for an agent?',
  ];

  for (const q of queries) {
    const hits = await store.search(q, 3);
    console.log(`\nQ: ${q}`);
    hits.forEach((h, i) =>
      console.log(`  #${i + 1} score=${h.score.toFixed(3)} :: ${h.text.slice(0, 120).replace(/\s+/g, ' ')}...`),
    );
  }
}

main().catch((err) => {
  console.error('SEARCH SMOKE FAIL ->', err);
  process.exit(1);
});
