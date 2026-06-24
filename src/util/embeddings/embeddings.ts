import { OllamaEmbeddings } from '@langchain/ollama';

export function createEmbeddings(): OllamaEmbeddings {
  return new OllamaEmbeddings({
    model: process.env.OLLAMA_EMBED_MODEL ?? 'all-minilm',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  });
}
