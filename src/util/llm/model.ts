import { ChatOllama } from '@langchain/ollama';

export function createChatModel(): ChatOllama {
  return new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? 'llama3',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    temperature: 0,
    // Garde le modèle chargé en mémoire entre les requêtes : évite les
    // rechargements coûteux (5+ Go) qui provoquaient des timeouts HTTP au
    // premier token sur CPU.
    keepAlive: process.env.OLLAMA_KEEP_ALIVE ?? '30m',
  });
}
