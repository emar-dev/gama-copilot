import { RagService } from '../src/ai/rag.service';
import { GamlService } from '../src/ai/gaml.service';
import { shutdownGamaServer } from '../src/util/gaml/gama-server';

async function main() {
  const rag = new RagService();
  await rag.onModuleInit();
  const gaml = new GamlService(rag);

  const description =
    process.env.DESC ??
    'Un modèle simple avec des agents "people" qui se déplacent aléatoirement sur une grille et sont affichés en rouge.';
  console.log('DEMANDE:', description, '\n');

  const start = Date.now();
  const res = await gaml.generate(description);

  console.log('=== CODE GAML ===\n' + res.code);
  console.log('\n=== VALIDATION ===');
  console.log('validatedBy:', res.validatedBy, '| attempts:', res.attempts);
  console.log('valid   :', res.validation.valid);
  console.log('errors  :', res.validation.errors);
  console.log('warnings:', res.validation.warnings);
  console.log(`\n(${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

main()
  .catch((err) => {
    console.error('GAML SMOKE FAIL ->', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownGamaServer();
    process.exit(process.exitCode ?? 0);
  });
