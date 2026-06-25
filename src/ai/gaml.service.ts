import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SystemMessage, HumanMessage, BaseMessage } from '@langchain/core/messages';
import { createChatModel } from '../util/llm/model';
import { RagService } from './rag.service';
import {
  GAML_SYSTEM_PROMPT,
  buildGamlUserPrompt,
  buildGamlRepairPrompt,
} from './prompts/gaml';
import { extractGaml } from '../util/gaml/extract';
import { normalizeGaml } from '../util/gaml/normalize';
import { validateGaml, GamlValidation } from '../util/gaml/validate';
import { gamaServer, validateWithGamaServer, shutdownGamaServer } from '../util/gaml/gama-server';

export interface GamlGeneration {
  code: string;
  validation: GamlValidation;
  validatedBy: 'gama' | 'heuristic';
  attempts: number;
  sources: { id: number; score: number }[];
}

@Injectable()
export class GamlService implements OnModuleDestroy {
  private readonly logger = new Logger(GamlService.name);
  private readonly model = createChatModel();

  constructor(private readonly rag: RagService) {}

  async onModuleDestroy(): Promise<void> {
    await shutdownGamaServer();
  }

  async generate(description: string, topK = 6): Promise<GamlGeneration> {
    const trimmed = description?.trim();
    if (!trimmed) {
      throw new BadRequestException('description is required');
    }

    const { context, sources } = await this.rag.retrieveContext(trimmed, topK);
    const useGama = process.env.GAMA_VALIDATE !== 'false' && gamaServer.isAvailable();
    const maxAttempts = Math.max(1, Number(process.env.GAML_MAX_ATTEMPTS ?? 2));

    let code = '';
    let feedback = '';
    let gamaErrors: string[] = [];
    let heuristic: GamlValidation = { valid: false, errors: [], warnings: [] };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const messages: BaseMessage[] = [new SystemMessage(GAML_SYSTEM_PROMPT)];
      messages.push(
        new HumanMessage(
          attempt === 1
            ? buildGamlUserPrompt(trimmed, context)
            : buildGamlRepairPrompt(trimmed, code, feedback),
        ),
      );

      const response = await this.model.invoke(messages);
      const raw =
        typeof response.content === 'string' ? response.content : String(response.content);
      code = normalizeGaml(extractGaml(raw));
      heuristic = validateGaml(code);

      if (!useGama) {
        return { code, validation: heuristic, validatedBy: 'heuristic', attempts: attempt, sources };
      }

      const gama = await validateWithGamaServer(code);
      gamaErrors = gama.errors;
      this.logger.log(
        `GAML attempt ${attempt}/${maxAttempts}: compiled=${gama.compiled}` +
          (gama.errors.length ? ` (${gama.errors.length} erreurs)` : ''),
      );

      if (gama.compiled) {
        return {
          code,
          validation: { valid: true, errors: [], warnings: heuristic.warnings },
          validatedBy: 'gama',
          attempts: attempt,
          sources,
        };
      }
      feedback = gama.errors.join('\n');
    }

    return {
      code,
      validation: {
        valid: false,
        errors: ['GAMA: modèle non compilé après corrections', ...gamaErrors],
        warnings: heuristic.warnings,
      },
      validatedBy: 'gama',
      attempts: maxAttempts,
      sources,
    };
  }
}
