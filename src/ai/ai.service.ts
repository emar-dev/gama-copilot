import { BadRequestException, Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { resolve, sep } from 'path';
import { extractPdf } from '../util/pdf/extract';
import { cleanText } from '../util/pdf/cleaner';
import { chunkText, searchChunks } from '../util/chunking/chunck';
import { RagService } from './rag.service';

const SYSTEM_PROMPT = [
  'Tu es GAMA Copilot, un assistant expert de la plateforme de simulation multi-agents GAMA et de son langage GAML.',
  'Règles à respecter strictement :',
  '- Réponds UNIQUEMENT à partir du CONTEXTE fourni (extraits de la documentation officielle GAMA).',
  "- Si le contexte ne permet pas de répondre, dis-le clairement ; n'invente jamais d'information.",
  '- Réponds dans la langue de la question, de façon concise et structurée.',
  '- Pour tout code, utilise un bloc ```gaml et respecte la syntaxe GAML.',
  '- Quand c\'est pertinent, cite les extraits utilisés par leur numéro, par ex. [#2].',
].join('\n');

@Injectable()
export class AiService {
  private readonly model = new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? 'llama3',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    temperature: 0,
  });

  constructor(private readonly rag: RagService) {}

  async ask(question: string) {
    const trimmed = question?.trim();
    if (!trimmed) return '';

    const response = await this.model.invoke(trimmed);
    return response.content;
  }

  async chat(question: string, topK = 6) {
    const trimmed = question?.trim();
    if (!trimmed) {
      throw new BadRequestException('question is required');
    }

    const hits = await this.rag.retrieve(trimmed, topK);
    if (hits.length === 0) {
      return {
        answer:
          "L'index documentaire n'est pas disponible. Génère-le avec 'npm run index:build'.",
        sources: [],
      };
    }

    const context = hits
      .map((hit, i) => `[#${i + 1}] (score=${hit.score.toFixed(3)})\n${hit.text}`)
      .join('\n\n');

    const response = await this.model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(`CONTEXTE:\n${context}\n\nQUESTION: ${trimmed}`),
    ]);

    return {
      answer: response.content,
      sources: hits.map((hit) => ({ id: hit.id, score: hit.score })),
    };
  }

  async getPDFText(filePath: string, query?: string) {
    if (!filePath?.trim()) {
      throw new BadRequestException('path is required');
    }

    const safePath = this.resolvePdfPath(filePath.trim());
    const text = cleanText(await extractPdf(safePath));

    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
      return text;
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) return text;

    const relevant = searchChunks(chunks, trimmedQuery, 3);
    return relevant.map((c) => c.text).join('\n\n');
  }

  private resolvePdfPath(userPath: string): string {
    const base = resolve(process.cwd());
    const resolved = resolve(base, userPath);
    if (resolved !== base && !resolved.startsWith(`${base}${sep}`)) {
      throw new BadRequestException('Invalid path');
    }
    return resolved;
  }
}
