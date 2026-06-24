import { chunkText, searchChunks } from './chunck';

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('keeps short text as a single chunk', () => {
    const chunks = chunkText('hello world', 1500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ id: 0, text: 'hello world' });
  });

  it('never produces a chunk larger than the requested size', () => {
    const size = 200;
    const longWord = 'a'.repeat(5000);
    const sentences = Array.from({ length: 50 }, (_, i) => `Sentence number ${i}.`).join(' ');
    const text = `${longWord} ${sentences}`;

    const chunks = chunkText(text, size, 20);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(size);
    }
  });

  it('assigns sequential ids', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}.`).join('\n\n');
    const chunks = chunkText(text, 50, 10);
    chunks.forEach((chunk, index) => expect(chunk.id).toBe(index));
  });
});

describe('searchChunks', () => {
  const chunks = [
    { id: 0, text: 'GAML species define agents and their behaviors' },
    { id: 1, text: 'A reflex runs at each simulation step' },
    { id: 2, text: 'The experiment block configures the simulation' },
  ];

  it('ranks chunks containing more query keywords first', () => {
    const hits = searchChunks(chunks, 'species agents behaviors', 1);
    expect(hits[0].id).toBe(0);
  });

  it('falls back to the first chunks when nothing matches', () => {
    const hits = searchChunks(chunks, 'xyznomatch', 2);
    expect(hits).toHaveLength(2);
  });
});
