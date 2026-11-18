import { Controller, Get } from '@nestjs/common';
import { gamaServer } from '../util/gaml/gama-server';

/**
 * État réel des briques dont dépend le copilote, pour l'indicateur « En ligne » de l'interface :
 * le serveur Ollama et le modèle de l'agent, et la présence de GAMA (validation, simulation).
 */
@Controller('assistant')
export class AssistantController {
  @Get('status')
  async status() {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    const model = process.env.OLLAMA_AGENT_MODEL ?? 'qwen2.5-coder:7b';
    let reachable = false;
    let modelInstalled = false;
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        reachable = true;
        const data = (await res.json()) as { models?: { name?: string }[] };
        modelInstalled = (data.models ?? []).some(
          (m) => m.name === model || m.name === `${model}:latest`,
        );
      }
    } catch {
      /* Ollama arrêté ou injoignable */
    }
    return {
      llm: { reachable, model, modelInstalled },
      gama: { installed: gamaServer.isAvailable() },
    };
  }
}
