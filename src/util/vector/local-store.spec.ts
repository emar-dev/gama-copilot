import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Embeddings } from '@langchain/core/embeddings';
import { LocalVectorStore } from './local-store';

// Embeddings déterministe et trivial : mappe un mot-clé sur un axe du vecteur.
const VOCAB = ['alpha', 'beta', 'gamma'];

function vectorize(text: string): number[] {
  const lower = text.toLowerCase();
  return VOCAB.map((w) => (lower.includes(w) ? 1 : 0));
}

const fakeEmbeddings = {
  embedDocuments: async (texts: string[]) => texts.map(vectorize),
  embedQuery: async (text: string) => vectorize(text),
} as unknown as Embeddings;

describe('LocalVectorStore', () => {
  let dir: string;
  let indexPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vec-'));
    indexPath = join(dir, 'index.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('builds, persists and reloads the index', async () => {
    const store = new LocalVectorStore(fakeEmbeddings, indexPath);
    await store.build([
      { id: 0, text: 'about alpha' },
      { id: 1, text: 'about beta' },
    ]);
    expect(store.size()).toBe(2);

    const reloaded = new LocalVectorStore(fakeEmbeddings, indexPath);
    expect(await reloaded.load()).toBe(true);
    expect(reloaded.size()).toBe(2);
  });

  it('returns the semantically closest chunk first', async () => {
    const store = new LocalVectorStore(fakeEmbeddings, indexPath);
    await store.build([
      { id: 0, text: 'document about alpha topic' },
      { id: 1, text: 'document about beta topic' },
      { id: 2, text: 'document about gamma topic' },
    ]);

    const hits = await store.search('tell me about beta', 1);
    expect(hits[0].id).toBe(1);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('resumes without re-embedding already indexed chunks', async () => {
    const chunks = [
      { id: 0, text: 'about alpha' },
      { id: 1, text: 'about beta' },
    ];
    const store = new LocalVectorStore(fakeEmbeddings, indexPath);
    await store.build([chunks[0]]);

    const spy = jest.spyOn(fakeEmbeddings, 'embedDocuments');
    await store.build(chunks, { resume: true });

    expect(store.size()).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('returns empty results when the index is empty', async () => {
    const store = new LocalVectorStore(fakeEmbeddings, indexPath);
    expect(await store.search('alpha')).toEqual([]);
  });
});
