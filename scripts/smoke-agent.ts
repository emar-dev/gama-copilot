import 'dotenv/config';
import { RagService } from '../src/ai/rag.service';
import { ProjectService } from '../src/project/project.service';
import { GamlService } from '../src/ai/gaml.service';
import { AgentService } from '../src/ai/agent/agent.service';
import { agentModelName } from '../src/util/llm/model';

async function main() {
  const rag = new RagService();
  await rag.onModuleInit();

  const gaml = new GamlService(rag);
  const project = new ProjectService(gaml);
  const agent = new AgentService(rag, project);

  const message =
    process.env.MSG ??
    'Cherche dans la documentation ce qu\'est une species en GAML et résume en 3 phrases.';

  console.log('MODELE AGENT:', agentModelName());
  console.log('MESSAGE:', message, '\n');
  const start = Date.now();

  const res = await agent.run(message);

  console.log('=== RÉPONSE ===\n' + res.answer);
  console.log('\n=== ÉTAPES OUTILS ===');
  for (const step of res.steps) {
    console.log(`- ${step.tool}: ${step.content.slice(0, 120)}...`);
  }
  console.log(`\n(${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

main().catch((err) => {
  console.error('AGENT SMOKE FAIL ->', err);
  process.exit(1);
});
