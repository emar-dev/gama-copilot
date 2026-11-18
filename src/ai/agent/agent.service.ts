import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOllama } from '@langchain/ollama';
import { ReactAgent } from 'langchain';
import { AGENT_SYSTEM_PROMPT } from '../prompts/agent';
import { createAgentModel } from '../../util/llm/model';
import { RagService } from '../rag.service';
import { ProjectService } from '../../project/project.service';
import { createCopilotTools, CopilotTool } from '../tools/copilot.tools';
import {
  createCopilotAgent,
  extractAgentAnswer,
  extractToolSteps,
  findPendingToolCall,
  isDocQuestion,
} from './agent.utils';

/** Échange précédent d'une conversation, transmis à l'agent comme contexte. */
export interface AgentTurn {
  role: 'user' | 'assistant';
  content: string;
}

const HISTORY_TURNS = 6;
const HISTORY_CHARS = 2000;

export interface AgentRunResult {
  answer: string;
  steps: { tool: string; content: string }[];
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private agent?: ReactAgent;
  private tools?: CopilotTool[];
  private synthesisModel?: ChatOllama;

  constructor(
    private readonly rag: RagService,
    private readonly project: ProjectService,
  ) {}

  /** J23-J25 : exécute l'agent ReAct sur une demande utilisateur. */
  async run(
    message: string,
    history: AgentTurn[] = [],
  ): Promise<AgentRunResult> {
    const trimmed = message?.trim();
    if (!trimmed) {
      throw new BadRequestException('message is required');
    }

    // Questions doc : qwen répond souvent sans appeler search_docs → RAG forcé
    const forceRagDisabled = /^(false|0|no|off)$/i.test(
      process.env.AGENT_FORCE_RAG ?? '',
    );
    if (!forceRagDisabled && isDocQuestion(trimmed)) {
      return this.runDocWithRag(trimmed);
    }

    const agent = this.getAgent();
    const rawLimit = Number(process.env.AGENT_MAX_ITERATIONS ?? 12);
    const recursionLimit = Math.max(
      4,
      Number.isFinite(rawLimit) ? rawLimit : 12,
    );

    this.logger.log(
      `Agent run (recursionLimit=${recursionLimit}): ${trimmed.slice(0, 80)}...`,
    );

    // Contexte : derniers échanges de la conversation, tronqués pour rester dans la fenêtre du modèle.
    const historyMessages: BaseMessage[] = history
      .slice(-HISTORY_TURNS)
      .map((turn) => {
        const content = turn.content.slice(0, HISTORY_CHARS);
        return turn.role === 'user'
          ? new HumanMessage(content)
          : new AIMessage(content);
      });

    let state: { messages?: BaseMessage[] } | undefined;
    try {
      state = (await agent.invoke(
        { messages: [...historyMessages, new HumanMessage(trimmed)] },
        { recursionLimit },
      )) as { messages?: BaseMessage[] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/does not support tools/i.test(msg)) {
        throw new BadRequestException(
          'Le modèle Ollama configuré ne supporte pas les tool calls. ' +
            'Définis OLLAMA_AGENT_MODEL=qwen2.5-coder:7b dans .env puis : ollama pull qwen2.5-coder:7b',
        );
      }
      throw err;
    }

    // Seuls les messages produits pour cette demande comptent (pas la réponse d'un échange précédent).
    const messages = (state?.messages ?? []).slice(historyMessages.length);
    let answer = extractAgentAnswer(messages);
    let steps = extractToolSteps(messages);

    // qwen-coder émet parfois l'outil sans l'exécuter (JSON texte ou tool_calls orphelins)
    // ou exécute l'outil mais ne synthétise pas la réponse finale
    if (!answer) {
      const pending = findPendingToolCall(messages);
      if (pending) {
        const fallback = await this.runToolFallback(trimmed, pending);
        if (fallback) {
          answer = fallback.answer;
          if (steps.length === 0) steps = fallback.steps;
        }
      } else if (steps.length > 0) {
        const synth = await this.synthesiseFromSteps(trimmed, steps);
        if (synth) answer = synth;
      }
    }

    return {
      answer: answer || '(aucune réponse textuelle — voir les étapes outils)',
      steps,
    };
  }

  /** Exécute un tool call non traité par l'agent puis synthétise la réponse. */
  private async runToolFallback(
    userMessage: string,
    call: { name: string; arguments: Record<string, unknown> },
  ): Promise<AgentRunResult | null> {
    const tool = this.getTools().find((t) => t.name === call.name);
    if (!tool) return null;

    this.logger.warn(`Fallback outil: exécution manuelle de ${call.name}`);
    let output: string;
    try {
      output = await (
        tool as { invoke: (input: unknown) => Promise<string> }
      ).invoke(call.arguments);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Fallback ${call.name} a échoué: ${errMsg}`);
      return {
        answer: `Erreur lors de l'exécution de ${call.name}: ${errMsg}`,
        steps: [{ tool: call.name, content: `ERROR: ${errMsg}`.slice(0, 500) }],
      };
    }
    const steps = [{ tool: call.name, content: String(output).slice(0, 500) }];

    const answer = await this.synthesiseFromSteps(userMessage, steps);
    return { answer: answer ?? String(output).trim(), steps };
  }

  /** Synthèse LLM à partir d'étapes d'outils déjà exécutées. */
  private async synthesiseFromSteps(
    userMessage: string,
    steps: { tool: string; content: string }[],
  ): Promise<string> {
    const model = this.getSynthesisModel();
    const summary = steps
      .map((s) => `Résultat de l'outil ${s.tool} :\n${s.content}`)
      .join('\n\n');
    const response = await model.invoke([
      new SystemMessage(AGENT_SYSTEM_PROMPT),
      new HumanMessage(
        `Demande utilisateur : ${userMessage}\n\n${summary}\n\n` +
          `Réponds à l'utilisateur de façon claire et concise.`,
      ),
    ]);
    return typeof response.content === 'string'
      ? response.content.trim()
      : extractAgentAnswer([response]);
  }

  /** Question documentaire : search_docs puis synthèse ancrée dans le PDF. */
  private async runDocWithRag(message: string): Promise<AgentRunResult> {
    this.logger.log('Question doc → search_docs (RAG forcé)');

    const searchTool = this.getTools().find((t) => t.name === 'search_docs');
    if (!searchTool) {
      throw new BadRequestException('outil search_docs indisponible');
    }

    const output = await (
      searchTool as { invoke: (input: unknown) => Promise<string> }
    ).invoke({
      query: message,
      limit: 6,
    });
    const steps = [
      { tool: 'search_docs', content: String(output).slice(0, 500) },
    ];

    const model = this.getSynthesisModel();
    const response = await model.invoke([
      new SystemMessage(AGENT_SYSTEM_PROMPT),
      new HumanMessage(
        `Demande utilisateur : ${message}\n\n` +
          `Résultat de search_docs (documentation GAMA) :\n${output}\n\n` +
          `Réponds UNIQUEMENT à partir de ce contexte. Sois concis.`,
      ),
    ]);
    const answer =
      typeof response.content === 'string'
        ? response.content.trim()
        : extractAgentAnswer([response]);

    return { answer, steps };
  }

  private getSynthesisModel(): ChatOllama {
    if (!this.synthesisModel) {
      this.synthesisModel = createAgentModel();
    }
    return this.synthesisModel;
  }

  private getTools(): CopilotTool[] {
    if (!this.tools) {
      this.tools = createCopilotTools({ rag: this.rag, project: this.project });
    }
    return this.tools;
  }

  private getAgent(): ReactAgent {
    if (!this.agent) {
      this.agent = createCopilotAgent(this.getTools());
    }
    return this.agent;
  }
}
