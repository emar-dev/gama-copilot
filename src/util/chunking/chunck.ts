import { Chunk } from '../../types/chunks/chunks';

// Découpe une chaîne trop longue en tranches de taille <= size, avec chevauchement.
function hardSplit(text: string, size: number, overlap: number): string[] {
  const slices: string[] = [];
  const step = Math.max(1, size - overlap);
  for (let offset = 0; offset < text.length; offset += step) {
    slices.push(text.slice(offset, offset + size));
    if (offset + size >= text.length) break;
  }
  return slices;
}

export function chunkText(text: string, size = 1500, overlap = 150): Chunk[] {
  if (!text) return [];
  if (text.length <= size) return [{ id: 0, text }];

  const safeOverlap = Math.min(Math.max(0, overlap), size - 1);
  const parts = text.split(/(?<=\.)\s+|\n{2,}/);

  const chunks: Chunk[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push({ id: chunks.length, text: trimmed });
  };

  let current = '';
  for (const part of parts) {
    const segment = part.endsWith('.') ? part : `${part}. `;

    // Un segment seul dépasse la taille cible : on le redécoupe durement.
    if (segment.length > size) {
      push(current);
      current = '';
      for (const slice of hardSplit(segment, size, safeOverlap)) push(slice);
      continue;
    }

    if (current.length + segment.length > size && current) {
      push(current);
      current = segment;
    } else {
      current += segment;
    }
  }

  push(current);
  return chunks;
}

function extractKeywords(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter((w) => w.length > 2))];
}

export function searchChunks(chunks: Chunk[], query: string, limit = 3): Chunk[] {
  if (chunks.length === 0) return [];

  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return chunks.slice(0, limit);
  }

  const scored = chunks.map((chunk) => {
    const text = chunk.text.toLowerCase();
    let score = 0;
    for (const word of keywords) {
      if (text.includes(word)) score++;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const matches = scored.filter((s) => s.score > 0).slice(0, limit);
  if (matches.length > 0) {
    return matches.map((s) => s.chunk);
  }

  return chunks.slice(0, limit);
}
