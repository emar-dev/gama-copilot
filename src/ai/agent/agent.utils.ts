import { BaseMessage, isAIMessage } from '@langchain/core/messages';
import { createAgent, ReactAgent } from 'langchain';
import { AGENT_SYSTEM_PROMPT } from '../prompts/agent';
import { createAgentModel } from '../../util/llm/model';

/** Détecte un appel d'outil renvoyé en JSON texte (qwen-coder sans tool_calls natifs). */
export function parseTextToolCall(
  content: string,
): { name: string; arguments: Record<string, unknown> } | null {
  const candidate = extractJsonObject(content);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const name =
      typeof parsed.name === 'string' && parsed.name
        ? parsed.name
        : typeof parsed.tool === 'string' && parsed.tool
        ? parsed.tool
        : null;
    const rawArgs =
      parsed.arguments ?? parsed.args ?? parsed.parameters ?? parsed.input ?? {};
    if (
      name &&
      rawArgs &&
      typeof rawArgs === 'object' &&
      !Array.isArray(rawArgs)
    ) {
      return { name, arguments: rawArgs as Record<string, unknown> };
    }
  } catch {
    /* pas du JSON */
  }
  return null;
}

function extractJsonObject(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const inner = fence[1].trim();
    if (inner.startsWith('{')) return inner;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

/** Cherche un appel d'outil non exécuté (JSON texte ou tool_calls natifs). */
export function findPendingToolCall(
  messages: BaseMessage[],
): { name: string; arguments: Record<string, unknown> } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isAIMessage(msg)) continue;

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const tc = msg.tool_calls.find(
        (c) => typeof c.name === 'string' && c.name.length > 0,
      );
      if (tc) {
        const args =
          tc.args && typeof tc.args === 'object' && !Array.isArray(tc.args)
            ? (tc.args as Record<string, unknown>)
            : {};
        return { name: tc.name, arguments: args };
      }
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
    if (typeof msg.content === 'string' && msg.content.trim()) {
      const text = msg.content.trim();
      if (isToolCallJson(text)) continue;
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
  const m = message.trim();
  if (
    /\b(crée|cree|creer|créer|create|écris|ecris|écrire|ecrire|write|génère|genere|générer|generer|generate|fais|make|build)\b.{0,80}\b(projet|project|modèle|modele|model|species|experiment|fichier|file|gaml|agent|simulation)\b/i.test(
      m,
    )
  ) {
    return false;
  }
  if (/\b(write_file|read_file|create_project|workspace)\b/i.test(m)) return false;

  return (
    /\b(gaml|gama|species|experiment|modèle|modele|agent|simulation|syntaxe|reflex|global|bloc)\b/i.test(
      m,
    ) ||
    /^(qu'?est|qu'est-ce|quel|quelle|comment|pourquoi|explique|définir|definir|cherche|à quoi sert|a quoi sert)/i.test(
      m,
    )
  );
}
