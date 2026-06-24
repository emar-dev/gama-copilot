import { Chunk } from '../chunks/chunks';

export interface VectorRecord {
  id: number;
  text: string;
  embedding: number[];
}

export interface SearchResult {
  id: number;
  text: string;
  score: number;
}

/**
 * Abstraction du stockage vectoriel. Permet de remplacer l'implémentation
 * locale par ChromaDB (ou autre) sans toucher au pipeline RAG.
 */
export interface VectorStore {
  build(chunks: Chunk[]): Promise<void>;
  load(): Promise<boolean>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  size(): number;
}
