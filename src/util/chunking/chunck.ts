import { Chunk } from "src/types/chunks/chunks";

export function chunkText(text: string, size = 1500): Chunk[] {
  const chunks: Chunk[] = [];
  let currentChunk = '';
  let id = 0;

  const sentences = text.split('. ');

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > size) {
      chunks.push({ id: id++, text: currentChunk });
      currentChunk = sentence + '. ';
    } else {
      currentChunk += sentence + '. ';
    }
  }

  if (currentChunk) {
    chunks.push({ id: id++, text: currentChunk });
  }

  return chunks;
}
export function searchChunks(chunks: Chunk[], query: string, limit = 3) {
  const keywords = query.toLowerCase().split(' ');

  return chunks
    .map(chunk => {
      const text = chunk.text.toLowerCase();

      let score = 0;

      for (const word of keywords) {
        if (text.includes(word)) {
          score++;
        }
      }

      return { ...chunk, score };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}