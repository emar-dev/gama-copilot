import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
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

export interface AgentRunResult {
  answer: string;
  steps: { tool: string; content: string }[];
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private agent?: ReactAgent;
  private tools?: CopilotTool[];

  constructor(
    private readonly rag: RagService,
    private readonly project: ProjectService,
  ) {}

  /** J23-J25 : exécute l'agent ReAct sur une demande utilisateur. */
  async run(message: string): Promise<AgentRunResult> {
    const trimmed = message?.trim();
    if (!trimmed) {
      throw new BadRequestException('message is required');
    }

    // Questions doc : qwen répond souvent sans appeler search_docs → RAG forcé
    if (process.env.AGENT_FORCE_RAG !== 'false' && isDocQuestion(trimmed)) {
      return this.runDocWithRag(trimmed);
    }

    const agent = this.getAgent();
    const recursionLimit = Math.max(4, Number(process.env.AGENT_MAX_ITERATIONS ?? 12));

    this.logger.log(`Agent run (recursionLimit=${recursionLimit}): ${trimmed.slice(0, 80)}...`);

    let state;
    try {
      state = await agent.invoke(
        { messages: [new HumanMessage(trimmed)] },
        { recursionLimit },
      );
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

    const messages = state.messages ?? [];
    let answer = extractAgentAnswer(messages);
    let steps = extractToolSteps(messages);

    // qwen-coder émet parfois l'outil sans l'exécuter (JSON texte ou tool_calls orphelins)
    if (steps.length === 0) {
      const pending = findPendingToolCall(messages);
      if (pending) {
        const fallback = await this.runToolFallback(trimmed, pending);
        if (fallback) {
          answer = fallback.answer;
          steps = fallback.steps;
        }
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
    const output = await (tool as { invoke: (input: unknown) => Promise<string> }).invoke(
      call.arguments,
    );
    const steps = [{ tool: call.name, content: String(output).slice(0, 500) }];

    const model = createAgentModel();
    const response = await model.invoke([
      new SystemMessage(AGENT_SYSTEM_PROMPT),
      new HumanMessage(
        `Demande utilisateur : ${userMessage}\n\n` +
          `Résultat de l'outil ${call.name} :\n${output}\n\n` +
          `Réponds à l'utilisateur de façon claire et concise.`,
      ),
    ]);
    const answer =
      typeof response.content === 'string'
        ? response.content.trim()
        : extractAgentAnswer([response]);

    return { answer, steps };
  }

  /** Question documentaire : search_docs puis synthèse ancrée dans le PDF. */
  private async runDocWithRag(message: string): Promise<AgentRunResult> {
    this.logger.log('Question doc → search_docs (RAG forcé)');

    const searchTool = this.getTools().find((t) => t.name === 'search_docs');
    if (!searchTool) {
      throw new BadRequestException('outil search_docs indisponible');
    }

    const output = await (searchTool as { invoke: (input: unknown) => Promise<string> }).invoke({
      query: message,
      limit: 6,
    });
    const steps = [{ tool: 'search_docs', content: String(output).slice(0, 500) }];

    const model = createAgentModel();
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
