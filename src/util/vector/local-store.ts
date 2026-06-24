import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { Embeddings } from '@langchain/core/embeddings';
import { Chunk } from '../../types/chunks/chunks';
import { SearchResult, VectorRecord, VectorStore } from '../../types/vector/vector';

export interface BuildOptions {
  batchSize?: number;
  checkpointEvery?: number;
  resume?: boolean;
  /** Tronque le texte envoyé à l'embedding (garde-fou contexte modèle). Le texte complet reste stocké. */
  embedMaxChars?: number;
  onProgress?: (done: number, total: number) => void;
}

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}

/**
 * Vector store local persistant (pur JS, sans serveur).
 * Sérialise les vecteurs sur disque et fait une recherche cosinus en mémoire.
 * Convient à des corpus de quelques milliers de chunks (cas GAMA).
 */
export class LocalVectorStore implements VectorStore {
  private records: VectorRecord[] = [];
  private indexModel?: string;
  private dim = 0;

  constructor(
    private readonly embeddings: Embeddings,
    private readonly indexPath: string,
  ) {}

  size(): number {
    return this.records.length;
  }

  private get modelName(): string | undefined {
    return (this.embeddings as { model?: string }).model;
  }

  /**
   * Construit l'index par lots avec sauvegarde de checkpoints.
   * Reprend automatiquement : les chunks déjà indexés (même id) sont ignorés.
   */
  async build(chunks: Chunk[], options: BuildOptions = {}): Promise<void> {
    const { batchSize = 16, checkpointEvery = 64, onProgress, resume = true, embedMaxChars } = options;
    const forEmbed = (text: string) =>
      embedMaxChars && text.length > embedMaxChars ? text.slice(0, embedMaxChars) : text;

    if (chunks.length === 0) {
      this.records = [];
      await this.save();
      return;
    }

    if (resume) {
      await this.load();
    } else {
      this.records = [];
    }

    const done = new Set(this.records.map((r) => r.id));
    const pending = chunks.filter((c) => !done.has(c.id));
    onProgress?.(this.records.length, chunks.length);

    let sinceCheckpoint = 0;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      const vectors = await this.embedBatchResilient(batch.map((c) => forEmbed(c.text)));

      batch.forEach((chunk, j) => {
        this.records.push({ id: chunk.id, text: chunk.text, embedding: vectors[j] });
      });

      sinceCheckpoint += batch.length;
      onProgress?.(this.records.length, chunks.length);

      if (sinceCheckpoint >= checkpointEvery) {
        await this.save();
        sinceCheckpoint = 0;
      }
    }

    await this.save();
  }

  async load(): Promise<boolean> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      const parsed = JSON.parse(raw) as { model?: string; dim?: number; records?: VectorRecord[] };
      this.records = parsed.records ?? [];
      this.indexModel = parsed.model;
      this.dim = parsed.dim ?? this.records[0]?.embedding.length ?? 0;
      return this.records.length > 0;
    } catch {
      return false;
    }
  }

  async search(query: string, limit = 3): Promise<SearchResult[]> {
    if (this.records.length === 0) return [];

    const queryVector = await this.embeddings.embedQuery(query);
    const expectedDim = this.dim || this.records[0]?.embedding.length || 0;
    if (expectedDim && queryVector.length !== expectedDim) {
      throw new Error(
        `Incohérence d'embedding: la requête fait ${queryVector.length} dimensions mais l'index en a ${expectedDim}. ` +
          `Le modèle de requête (${this.modelName ?? 'inconnu'}) doit correspondre au modèle de l'index ` +
          `(${this.indexModel ?? 'inconnu'}). Définis OLLAMA_EMBED_MODEL=${this.indexModel ?? 'all-minilm'} ` +
          `ou reconstruis l'index avec 'npm run index:build'.`,
      );
    }

    return this.records
      .map((record) => ({
        id: record.id,
        text: record.text,
        score: cosineSimilarity(queryVector, record.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, limit));
  }

  /** Embedding d'un lot ; si le lot échoue (ex: contexte dépassé), bascule en doc-par-doc résilient. */
  private async embedBatchResilient(texts: string[]): Promise<number[][]> {
    try {
      return await this.embeddings.embedDocuments(texts);
    } catch {
      const out: number[][] = [];
      for (const text of texts) out.push(await this.embedOneResilient(text));
      return out;
    }
  }

  /** Embedding d'un seul texte ; en cas d'échec, tronque de moitié et réessaie. */
  private async embedOneResilient(text: string): Promise<number[]> {
    let input = text;
    for (let attempt = 0; attempt < 8 && input.length > 0; attempt++) {
      try {
        return await this.embeddings.embedQuery(input);
      } catch (err) {
        const next = Math.floor(input.length / 2);
        if (next === 0) throw err;
        input = input.slice(0, next);
      }
    }
    throw new Error('embedOneResilient: impossible de produire un embedding');
  }

  private async save(): Promise<void> {
    this.dim = this.records[0]?.embedding.length ?? 0;
    this.indexModel = this.modelName ?? this.indexModel;
    await mkdir(dirname(this.indexPath), { recursive: true });
    await writeFile(
      this.indexPath,
      JSON.stringify({ model: this.indexModel, dim: this.dim, records: this.records }),
      'utf-8',
    );
  }
}
