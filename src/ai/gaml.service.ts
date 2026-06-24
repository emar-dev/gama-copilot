import { BadRequestException, Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { RagService } from './rag.service';
import { GAML_SYSTEM_PROMPT, buildGamlUserPrompt } from './prompts/gaml';
import { extractGaml } from '../util/gaml/extract';
import { validateGaml, GamlValidation } from '../util/gaml/validate';

export interface GamlGeneration {
  code: string;
  validation: GamlValidation;
  sources: { id: number; score: number }[];
}

@Injectable()
export class GamlService {
  private readonly model = new ChatOllama({
    model: process.env.OLLAMA_MODEL ?? 'llama3',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    temperature: 0,
  });

  constructor(private readonly rag: RagService) {}

  async generate(description: string, topK = 6): Promise<GamlGeneration> {
    const trimmed = description?.trim();
    if (!trimmed) {
      throw new BadRequestException('description is required');
    }

    const hits = await this.rag.retrieve(trimmed, topK);
    const context = hits
      .map((hit, i) => `[#${i + 1}] ${hit.text}`)
      .join('\n\n');

    const response = await this.model.invoke([
      new SystemMessage(GAML_SYSTEM_PROMPT),
      new HumanMessage(buildGamlUserPrompt(trimmed, context)),
    ]);

    const raw = typeof response.content === 'string' ? response.content : String(response.content);
    const code = extractGaml(raw);

    return {
      code,
      validation: validateGaml(code),
      sources: hits.map((hit) => ({ id: hit.id, score: hit.score })),
    };
  }
}
