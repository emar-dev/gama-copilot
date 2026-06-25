import { ChatOllama } from '@langchain/ollama';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_KEEP = process.env.OLLAMA_KEEP_ALIVE ?? '30m';

/** Modèles connus pour ne PAS supporter les tool calls côté Ollama. */
const NO_TOOLS_MODELS = new Set(['llama3', 'llama3:latest', 'llama3:8b', 'llama2', 'mistral']);

export function agentModelName(): string {
  return process.env.OLLAMA_AGENT_MODEL ?? 'qwen2.5-coder:7b';
}

export function createChatModel(): ChatOllama {
  return new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? 'llama3',
    baseUrl: OLLAMA_BASE,
    temperature: 0,
    keepAlive: OLLAMA_KEEP,
  });
}

/** Modèle pour l'agent ReAct : doit supporter les tool calls (qwen2.5-coder, etc.). */
export function createAgentModel(): ChatOllama {
  const model = agentModelName();
  if (NO_TOOLS_MODELS.has(model) || model.startsWith('llama3')) {
    throw new Error(
      `OLLAMA_AGENT_MODEL=${model} ne supporte pas les tool calls. ` +
        'Utilise qwen2.5-coder:7b (ollama pull qwen2.5-coder:7b).',
    );
  }
  return new ChatOllama({
    model,
    baseUrl: OLLAMA_BASE,
    temperature: 0,
    keepAlive: OLLAMA_KEEP,
  });
}
