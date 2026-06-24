import { extractPdf } from '../src/util/pdf/extract';
import { cleanText } from '../src/util/pdf/cleaner';
import { chunkText } from '../src/util/chunking/chunck';
import { createEmbeddings } from '../src/util/embeddings/embeddings';
import { LocalVectorStore } from '../src/util/vector/local-store';

const SOURCE = process.env.GAMA_PDF ?? 'gama.pdf';
const INDEX_PATH = process.env.INDEX_PATH ?? 'data/gama-index.json';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
const CHUNK_SIZE = process.env.CHUNK_SIZE ? Number(process.env.CHUNK_SIZE) : 1500;
const EMBED_MAX_CHARS = process.env.EMBED_MAX_CHARS ? Number(process.env.EMBED_MAX_CHARS) : undefined;

async function main() {
  const start = Date.now();

  const text = cleanText(await extractPdf(SOURCE));
  let chunks = chunkText(text, CHUNK_SIZE);
  if (LIMIT) chunks = chunks.slice(0, LIMIT);
  console.log(`Chunks à indexer: ${chunks.length} (modèle: ${process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'})`);

  const store = new LocalVectorStore(createEmbeddings(), INDEX_PATH);
  await store.build(chunks, {
    embedMaxChars: EMBED_MAX_CHARS,
    onProgress: (done, total) => {
      const pct = ((done / total) * 100).toFixed(1);
      const elapsed = (Date.now() - start) / 1000;
      process.stdout.write(`\rprogress: ${done}/${total} (${pct}%) - ${elapsed.toFixed(0)}s`);
    },
  });

  process.stdout.write('\n');
  console.log(`Index écrit (${store.size()} vecteurs) -> ${INDEX_PATH} en ${((Date.now() - start) / 1000).toFixed(0)}s`);
}

main().catch((err) => {
  console.error('\nBUILD INDEX FAIL ->', err);
  process.exit(1);
});
