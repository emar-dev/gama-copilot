import { RagService } from '../src/ai/rag.service';
import { GamlService } from '../src/ai/gaml.service';
import { ProjectService } from '../src/project/project.service';

async function main() {
  const rag = new RagService();
  await rag.onModuleInit();
  const gaml = new GamlService(rag);
  const project = new ProjectService(gaml);

  const name = process.env.NAME ?? 'PredatorPrey';
  const desc =
    process.env.DESC ??
    'Un modèle proie-prédateur avec des agents prey (verts) et predator (rouges) qui se déplacent.';

  console.log(`Création du projet "${name}"...\n`);
  const start = Date.now();
  const res = await project.createProject(name, desc);

  console.log('project :', res.project);
  console.log('path    :', res.path);
  console.log('files   :', res.files);
  console.log('valid   :', res.model.validation.valid);
  console.log('errors  :', res.model.validation.errors);
  console.log('warnings:', res.model.validation.warnings);
  console.log(`\n(${((Date.now() - start) / 1000).toFixed(0)}s)`);
}

main().catch((err) => {
  console.error('PROJECT SMOKE FAIL ->', err);
  process.exit(1);
});
