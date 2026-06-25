import 'dotenv/config';
import { RagService } from '../src/ai/rag.service';
import { AiService } from '../src/ai/ai.service';
import { GamlService } from '../src/ai/gaml.service';
import { ProjectService } from '../src/project/project.service';
import { AgentService } from '../src/ai/agent/agent.service';
import { shutdownGamaServer } from '../src/util/gaml/gama-server';

async function section(title: string, fn: () => Promise<void>) {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
  const start = Date.now();
  await fn();
  console.log(`(${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

async function main() {
  const rag = new RagService();
  await rag.onModuleInit();
  const ai = new AiService(rag);
  const gaml = new GamlService(rag);
  const project = new ProjectService(gaml);
  const agent = new AgentService(rag, project);

  // 1. RAG — question documentation
  await section('1. RAG — Question sur la documentation GAMA', async () => {
    const q = "Qu'est-ce qu'un agent dans GAMA ?";
    console.log('Q:', q);
    const res = await ai.chat(q);
    console.log('A:', String(res.answer).slice(0, 400));
    console.log('sources:', res.sources.length);
  });

  // 2. Génération GAML simple
  await section('2. GAML — Génération modèle simple', async () => {
    const desc =
      'Des agents people qui se déplacent aléatoirement, affichés en rouge.';
    console.log('DESC:', desc);
    const res = await gaml.generate(desc);
    console.log('valid:', res.validation.valid, '| attempts:', res.attempts);
    console.log('code (extrait):', res.code.split('\n').slice(0, 8).join('\n'), '...');
  });

  // 3. Agent — recherche doc
  await section('3. AGENT — Recherche documentaire autonome', async () => {
    const msg = 'Explique le rôle du bloc global dans un modèle GAML.';
    console.log('MSG:', msg);
    const res = await agent.run(msg);
    console.log('A:', res.answer.slice(0, 400));
    console.log('tools:', res.steps.map((s) => s.tool).join(', ') || '(aucun)');
  });

  // 4. Agent — création projet (optionnel, lent)
  if (process.env.INCLUDE_SLOW === '1') {
    await section('4. AGENT — Création projet GAMA', async () => {
      const msg =
        'Crée un projet SimpleMove avec des agents qui bougent aléatoirement en bleu.';
      console.log('MSG:', msg);
      const res = await agent.run(msg);
      console.log('A:', res.answer.slice(0, 400));
      console.log('tools:', res.steps.map((s) => s.tool).join(', '));
    });
  } else {
    console.log('\n(Étape 4 création projet ignorée — définis INCLUDE_SLOW=1 pour l\'inclure)');
  }

  console.log('\n' + '='.repeat(60));
  console.log('DÉMO MVP TERMINÉE');
  console.log('API : GET /ai/chat?q=... | GET /ai/generate?q=... | POST /agent {message}');
  console.log('='.repeat(60));
}

main()
  .catch((err) => {
    console.error('DEMO MVP FAIL ->', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownGamaServer();
    process.exit(process.exitCode ?? 0);
  });
