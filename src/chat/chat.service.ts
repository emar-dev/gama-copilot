import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentService, type AgentTurn } from '../ai/agent/agent.service';
import { ProjectService } from '../project/project.service';
import {
  ChatMessage,
  Conversation,
  type MessageStep,
} from './conversation.entity';

export interface ConversationView {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageView {
  id: string;
  role: ChatMessage['role'];
  content: string;
  status: ChatMessage['status'];
  steps: MessageStep[];
  projects: string[];
  createdAt: Date;
}

const TITLE_MAX = 80;
const HISTORY_MESSAGES = 12;

function toConversationView(c: Conversation): ConversationView {
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toMessageView(m: ChatMessage): MessageView {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    steps: m.steps ?? [],
    projects: m.projects ?? [],
    createdAt: m.createdAt,
  };
}

/** Titre lisible tiré de la première demande. */
export function titleFrom(message: string): string {
  const line = message.trim().split(/\r?\n/)[0].replace(/\s+/g, ' ');
  return line.length > TITLE_MAX
    ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : line;
}

/**
 * Projets touchés par l'agent, déduits de ses appels d'outils. Les contenus d'étapes sont
 * tronqués : on lit les champs utiles par expression régulière plutôt qu'en JSON complet.
 */
export function projectsFromSteps(steps: MessageStep[]): string[] {
  const found = new Set<string>();
  for (const step of steps) {
    if (step.tool === 'create_project') {
      const m = /"project"\s*:\s*"([A-Za-z][\w-]*)"/.exec(step.content);
      if (m) found.add(m[1]);
    } else if (step.tool === 'write_file') {
      const m = /"path"\s*:\s*"([A-Za-z][\w-]*)\//.exec(step.content);
      if (m) found.add(m[1]);
    }
  }
  return [...found];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(ChatMessage)
    private readonly messages: Repository<ChatMessage>,
    private readonly agent: AgentService,
    private readonly projects: ProjectService,
  ) {}

  async list(userId: string): Promise<ConversationView[]> {
    const rows = await this.conversations.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 100,
    });
    return rows.map(toConversationView);
  }

  async get(userId: string, id: string) {
    const conversation = await this.owned(userId, id);
    const messages = await this.messages.find({
      where: { conversationId: conversation.id },
      order: { createdAt: 'ASC' },
    });
    return {
      conversation: toConversationView(conversation),
      messages: messages.map(toMessageView),
    };
  }

  /**
   * Enregistre la demande, fait répondre l'agent avec le contexte de la conversation,
   * puis enregistre la réponse. Sans conversationId, une nouvelle conversation est créée.
   */
  async send(userId: string, conversationId: string | null, text: string) {
    const content = text.trim();
    const conversation = conversationId
      ? await this.owned(userId, conversationId)
      : await this.conversations.save(
          this.conversations.create({ userId, title: titleFrom(content) }),
        );

    const previous = await this.messages.find({
      where: { conversationId: conversation.id, status: 'ok' },
      order: { createdAt: 'DESC' },
      take: HISTORY_MESSAGES,
    });
    const history: AgentTurn[] = previous
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }));

    const userMessage = await this.messages.save(
      this.messages.create({
        conversationId: conversation.id,
        role: 'user',
        content,
        status: 'ok',
        steps: null,
        projects: null,
      }),
    );

    let reply: Partial<ChatMessage>;
    try {
      const result = await this.agent.run(content, history);
      const touched = projectsFromSteps(result.steps);
      const existing = new Set(
        (await this.projects.listProjects()).map((p) => p.name),
      );
      reply = {
        content: result.answer,
        status: 'ok',
        steps: result.steps,
        projects: touched.filter((name) => existing.has(name)),
      };
    } catch (error) {
      this.logger.error(
        "Échec de l'agent",
        error instanceof Error ? error.stack : String(error),
      );
      const detail =
        error instanceof Error && error.message ? ` (${error.message})` : '';
      reply = {
        content: `Le copilote n'a pas pu répondre${detail}. Vérifiez qu'Ollama est démarré, puis renvoyez votre demande.`,
        status: 'error',
        steps: null,
        projects: null,
      };
    }

    const assistantMessage = await this.messages.save(
      this.messages.create({
        conversationId: conversation.id,
        role: 'assistant',
        ...reply,
      }),
    );
    // Remonte la conversation en tête de l'historique.
    await this.conversations.update(conversation.id, { updatedAt: new Date() });
    const fresh = await this.owned(userId, conversation.id);

    return {
      conversation: toConversationView(fresh),
      messages: [toMessageView(userMessage), toMessageView(assistantMessage)],
    };
  }

  async rename(userId: string, id: string, title: string) {
    const conversation = await this.owned(userId, id);
    conversation.title = title.trim().slice(0, 200);
    return toConversationView(await this.conversations.save(conversation));
  }

  async remove(userId: string, id: string): Promise<void> {
    const conversation = await this.owned(userId, id);
    await this.conversations.delete(conversation.id);
  }

  /** Une conversation d'un autre utilisateur répond 404, comme si elle n'existait pas. */
  private async owned(userId: string, id: string): Promise<Conversation> {
    const conversation = await this.conversations.findOne({
      where: { id, userId },
    });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    return conversation;
  }
}
