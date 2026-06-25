import { BaseMessage, isAIMessage } from '@langchain/core/messages';
import { createAgent, ReactAgent } from 'langchain';
import { AGENT_SYSTEM_PROMPT } from '../prompts/agent';
import { createAgentModel } from '../../util/llm/model';

/** Détecte un appel d'outil renvoyé en JSON texte (qwen-coder sans tool_calls natifs). */
export function parseTextToolCall(content: string): { name: string; arguments: Record<string, unknown> } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as { name?: string; arguments?: Record<string, unknown> };
    if (parsed.name && parsed.arguments && typeof parsed.arguments === 'object') {
      return { name: parsed.name, arguments: parsed.arguments };
    }
  } catch {
    /* pas du JSON */
  }
  return null;
}

/** Cherche un appel d'outil non exécuté (JSON texte ou tool_calls natifs). */
export function findPendingToolCall(
  messages: BaseMessage[],
): { name: string; arguments: Record<string, unknown> } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isAIMessage(msg)) continue;

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const tc = msg.tool_calls[0];
      const args =
        tc.args && typeof tc.args === 'object' && !Array.isArray(tc.args)
          ? (tc.args as Record<string, unknown>)
          : {};
      return { name: tc.name, arguments: args };
    }

    if (typeof msg.content === 'string') {
      const parsed = parseTextToolCall(msg.content);
      if (parsed) return parsed;
    }
  }
  return null;
}

function isToolCallJson(text: string): boolean {
  return parseTextToolCall(text) !== null;
}

/** Extrait le dernier message assistant non vide d'une exécution d'agent. */
export function extractAgentAnswer(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isAIMessage(msg)) continue;
    const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
    if (typeof msg.content === 'string' && msg.content.trim()) {
      const text = msg.content.trim();
      if (hasToolCalls && isToolCallJson(text)) continue;
      if (!hasToolCalls && isToolCallJson(text)) continue;
      return text;
    }
    if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (text) return text;
    }
  }
  return '';
}

/** Liste les appels d'outils exécutés pendant l'agent (pour audit / debug). */
export function extractToolSteps(messages: BaseMessage[]): { tool: string; content: string }[] {
  const steps: { tool: string; content: string }[] = [];
  for (const msg of messages) {
    if (msg.getType() !== 'tool') continue;
    const name = (msg as { name?: string }).name ?? 'unknown';
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    steps.push({ tool: name, content: content.slice(0, 500) });
  }
  return steps;
}

export function createCopilotAgent(tools: Parameters<typeof createAgent>[0]['tools']): ReactAgent {
  return createAgent({
    model: createAgentModel(),
    tools,
    systemPrompt: AGENT_SYSTEM_PROMPT,
  });
}

/** Détecte une question documentaire (doit passer par search_docs / RAG). */
export function isDocQuestion(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (/\b(crée|creer|create).{0,40}\b(projet|project)\b/i.test(m)) return false;
  if (/\b(write_file|read_file|fichier|workspace)\b/i.test(m)) return false;

  return (
    /\b(gaml|gama|species|experiment|modèle|modele|agent|simulation|syntaxe|reflex|global|bloc)\b/i.test(
      m,
    ) ||
    /^(qu'?est|qu'est-ce|quel|quelle|comment|pourquoi|explique|définir|definir|cherche|à quoi sert|a quoi sert)/i.test(
      m,
    )
  );
}
