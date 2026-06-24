import { extractPdf } from '../src/util/pdf/extract';
import { cleanText } from '../src/util/pdf/cleaner';
import { chunkText, searchChunks } from '../src/util/chunking/chunck';

async function main() {
  const raw = await extractPdf('gama.pdf');
  console.log('1) extractPdf  -> chars:', raw.length);

  const clean = cleanText(raw);
  console.log('2) cleanText   -> chars:', clean.length);

  const chunks = chunkText(clean);
  const sizes = chunks.map((c) => c.text.length);
  const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1));
  console.log(
    '3) chunkText   -> chunks:',
    chunks.length,
    '| min:',
    Math.min(...sizes),
    '| max:',
    Math.max(...sizes),
    '| avg:',
    avg,
  );

  const q = 'how to define a species in GAML';
  const hits = searchChunks(chunks, q, 3);
  console.log('4) searchChunks ->', hits.length, 'hits for:', q);
  console.log('   top hit preview:', hits[0]?.text.slice(0, 160), '...');
}

main().catch((err) => {
  console.error('RAG SMOKE FAIL ->', err);
  process.exit(1);
});
