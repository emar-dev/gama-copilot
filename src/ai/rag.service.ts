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
}
