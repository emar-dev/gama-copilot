import { readFile, stat } from 'fs/promises';
import { resolve } from 'path';

const MAX_CACHE_ENTRIES = 10;
const cache = new Map<string, { mtimeMs: number; text: string }>();

export async function extractPdf(filePath: string): Promise<string> {
  const resolved = resolve(filePath);
  const { mtimeMs } = await stat(resolved);

  const cached = cache.get(resolved);
  if (cached?.mtimeMs === mtimeMs) {
    return cached.text;
  }

  const buffer = await readFile(resolved);
  // Import paresseux: évite de charger pdf-parse (et son binding natif canvas)
  // tant qu'aucune extraction n'est réellement demandée.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const text = result.text;

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(resolved, { mtimeMs, text });

  return text;
}
