import { BadRequestException, Injectable } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { createChatModel } from '../util/llm/model';
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
  private readonly model = createChatModel();

  constructor(private readonly rag: RagService) {}

  async generate(description: string, topK = 6): Promise<GamlGeneration> {
    const trimmed = description?.trim();
    if (!trimmed) {
      throw new BadRequestException('description is required');
    }

    const { context, sources } = await this.rag.retrieveContext(trimmed, topK);

    const response = await this.model.invoke([
      new SystemMessage(GAML_SYSTEM_PROMPT),
      new HumanMessage(buildGamlUserPrompt(trimmed, context)),
    ]);

    const raw = typeof response.content === 'string' ? response.content : String(response.content);
    const code = extractGaml(raw);

    return {
      code,
      validation: validateGaml(code),
      sources,
    };
  }
}
