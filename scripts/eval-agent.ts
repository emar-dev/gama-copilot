import 'dotenv/config';
import { RagService } from '../src/ai/rag.service';
import { ProjectService } from '../src/project/project.service';
import { GamlService } from '../src/ai/gaml.service';
import { AgentService } from '../src/ai/agent/agent.service';
import { shutdownGamaServer } from '../src/util/gaml/gama-server';

interface AgentScenario {
  id: string;
  message: string;
  /** Doit appeler search_docs (directement ou via fallback). */
  expectTool?: string;
  /** Mots attendus dans la réponse (au moins un). */
  expectInAnswer?: string[];
}

const SCENARIOS: AgentScenario[] = [
  {
    id: 'doc-species',
    message: "Qu'est-ce qu'une species en GAML ? Réponds en 2 phrases.",
    expectTool: 'search_docs',
    expectInAnswer: ['species', 'agent'],
  },
  {
    id: 'doc-experiment',
    message: 'À quoi sert un bloc experiment dans un modèle GAML ?',
    expectTool: 'search_docs',
    expectInAnswer: ['experiment'],
  },
];

const SLOW_SCENARIO: AgentScenario = {
  id: 'create-project',
  message:
    'Crée un projet GAMA nommé DemoAgents avec des agents qui se déplacent aléatoirement et sont affichés en bleu.',
  expectTool: 'create_project',
  expectInAnswer: ['DemoAgents', 'projet', 'workspace', 'models', 'créé', 'cree'],
};

async function runScenario(agent: AgentService, scenario: AgentScenario) {
  console.log(`\n===== ${scenario.id} =====`);
  console.log('>', scenario.message);
  const start = Date.now();
  const res = await agent.run(scenario.message);
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);

  const tools = res.steps.map((s) => s.tool);
  const toolOk = !scenario.expectTool || tools.includes(scenario.expectTool);
  const answerLower = res.answer.toLowerCase();
  const answerOk =
    !scenario.expectInAnswer?.length ||
    scenario.expectInAnswer.some((w) => answerLower.includes(w.toLowerCase()));
  const ok = res.answer.length > 20 && toolOk && answerOk;

  console.log(`answer (${elapsed}s):`, res.answer.slice(0, 200) + (res.answer.length > 200 ? '...' : ''));
  console.log('tools:', tools.join(', ') || '(aucun)');
  console.log(ok ? '=> OK' : `=> FAIL (toolOk=${toolOk}, answerOk=${answerOk})`);

  return { id: scenario.id, ok, tools, elapsed: Number(elapsed) };
}

async function main() {
  const rag = new RagService();
  await rag.onModuleInit();
  const gaml = new GamlService(rag);
  const project = new ProjectService(gaml);
  const agent = new AgentService(rag, project);

  const scenarios = [...SCENARIOS];
  if (process.env.INCLUDE_SLOW === '1') {
    scenarios.push(SLOW_SCENARIO);
  }

  const results: { id: string; ok: boolean; tools: string[]; elapsed: number }[] = [];
  for (const s of scenarios) {
    results.push(await runScenario(agent, s));
  }

  console.log('\n===== RÉSUMÉ =====');
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id} (${r.elapsed}s, tools=${r.tools.join('+') || '-'})`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} scénarios réussis`);
  if (passed < results.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('EVAL AGENT FAIL ->', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownGamaServer();
    process.exit(process.exitCode ?? 0);
  });
