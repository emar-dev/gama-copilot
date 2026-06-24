import { RagService } from '../src/ai/rag.service';
import { GamlService } from '../src/ai/gaml.service';

const SCENARIOS: { name: string; desc: string }[] = [
  {
    name: 'trafic',
    desc: 'Un modèle de trafic routier : des agents "car" se déplacent à une vitesse donnée le long d\'une route et sont affichés en bleu.',
  },
  {
    name: 'epidemie',
    desc: 'Un modèle épidémiologique SIR : des agents "people" ont un état susceptible, infected ou recovered ; un agent infecté contamine les agents proches avec une certaine probabilité.',
  },
];

async function main() {
  const rag = new RagService();
  await rag.onModuleInit();
  const gaml = new GamlService(rag);

  const results: { name: string; valid: boolean; errors: number; warnings: number }[] = [];

  for (const s of SCENARIOS) {
    console.log(`\n===== SCÉNARIO: ${s.name} =====`);
    const start = Date.now();
    const res = await gaml.generate(s.desc);
    console.log(res.code);
    console.log(`--- valid=${res.validation.valid} | errors=${res.validation.errors.length} | warnings=${res.validation.warnings.length} | ${((Date.now() - start) / 1000).toFixed(0)}s`);
    if (res.validation.errors.length) console.log('  errors:', res.validation.errors);
    if (res.validation.warnings.length) console.log('  warnings:', res.validation.warnings);
    results.push({
      name: s.name,
      valid: res.validation.valid,
      errors: res.validation.errors.length,
      warnings: res.validation.warnings.length,
    });
  }

  console.log('\n===== RÉSUMÉ =====');
  for (const r of results) {
    console.log(`${r.valid ? 'OK  ' : 'FAIL'} ${r.name} (errors=${r.errors}, warnings=${r.warnings})`);
  }
  const passed = results.filter((r) => r.valid).length;
  console.log(`\n${passed}/${results.length} scénarios syntaxiquement valides`);
}

main().catch((err) => {
  console.error('EVAL GAML FAIL ->', err);
  process.exit(1);
});
