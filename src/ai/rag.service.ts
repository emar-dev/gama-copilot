import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createEmbeddings } from '../util/embeddings/embeddings';
import { LocalVectorStore } from '../util/vector/local-store';
import { SearchResult } from '../types/vector/vector';

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private readonly store = new LocalVectorStore(
    createEmbeddings(),
    process.env.INDEX_PATH ?? 'data/gama-index.json',
  );
  private ready = false;

  async onModuleInit(): Promise<void> {
    this.ready = await this.store.load();
    if (this.ready) {
      this.logger.log(`Index RAG chargé: ${this.store.size()} vecteurs`);
    } else {
      this.logger.warn(
        "Index RAG introuvable ou vide. Lance 'npm run index:build' pour générer data/gama-index.json",
      );
    }
  }

  isReady(): boolean {
    return this.ready && this.store.size() > 0;
  }

  async retrieve(query: string, limit = 4): Promise<SearchResult[]> {
    if (!this.isReady()) return [];
    return this.store.search(query, limit);
  }

  /** Récupère le contexte formaté + les sources, prêt à injecter dans un prompt. */
  async retrieveContext(
    query: string,
    limit = 6,
  ): Promise<{ context: string; sources: { id: number; score: number }[] }> {
    const hits = await this.retrieve(query, limit);
    const context = hits.map((hit, i) => `[#${i + 1}] ${hit.text}`).join('\n\n');
    const sources = hits.map((hit) => ({ id: hit.id, score: hit.score }));
    return { context, sources };
  }
}
