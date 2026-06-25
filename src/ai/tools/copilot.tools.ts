import { tool } from 'langchain';
import { z } from 'zod';
import { RagService } from '../rag.service';
import { ProjectService } from '../../project/project.service';

export interface CopilotToolDeps {
  rag: RagService;
  project: ProjectService;
}

/** J22 : outils LangChain branchés sur les services existants. */
export function createCopilotTools(deps: CopilotToolDeps) {
  const searchDocs = tool(
    async ({ query, limit }) => {
      const { context, sources } = await deps.rag.retrieveContext(query, limit ?? 6);
      return JSON.stringify({
        found: sources.length,
        sources,
        context: context || '(aucun passage pertinent)',
      });
    },
    {
      name: 'search_docs',
      description:
        'Recherche sémantique dans la documentation GAMA (manuel PDF indexé). ' +
        'À utiliser pour les questions sur GAML, GAMA, la syntaxe ou les concepts.',
      schema: z.object({
        query: z.string().describe('Question ou mots-clés à rechercher'),
        limit: z.number().int().min(1).max(12).optional().describe('Nombre de passages (défaut 6)'),
      }),
    },
  );

  const readFile = tool(
    async ({ path }) => {
      const result = await deps.project.readFile(path);
      return JSON.stringify({ path: result.path, content: result.content });
    },
    {
      name: 'read_file',
      description:
        'Lit le contenu d\'un fichier dans le workspace GAMA. ' +
        'Exemple de chemin : MonProjet/models/main.gaml',
      schema: z.object({
        path: z.string().describe('Chemin relatif du fichier dans le workspace'),
      }),
    },
  );

  const writeFile = tool(
    async ({ path, content }) => {
      const result = await deps.project.writeFile(path, content);
      return JSON.stringify({ path: result.path, written: true });
    },
    {
      name: 'write_file',
      description:
        'Écrit ou crée un fichier dans le workspace GAMA (crée les dossiers parents si besoin).',
      schema: z.object({
        path: z.string().describe('Chemin relatif du fichier'),
        content: z.string().describe('Contenu texte complet du fichier'),
      }),
    },
  );

  const createProject = tool(
    async ({ name, description }) => {
      const result = await deps.project.createProject(name, description);
      return JSON.stringify({
        project: result.project,
        path: result.path,
        files: result.files,
        model: result.model,
        validation: result.model.validation,
        sources: result.sources,
      });
    },
    {
      name: 'create_project',
      description:
        'Crée un projet GAMA complet : structure Eclipse (.project, dossiers) + modèle GAML généré ' +
        'depuis une description en langage naturel. Opération longue (génération + validation GAMA).',
      schema: z.object({
        name: z
          .string()
          .describe('Nom du projet (lettres/chiffres/underscore, ex. SimpleMovement)'),
        description: z
          .string()
          .describe('Description du modèle de simulation à générer en GAML'),
      }),
    },
  );

  return [searchDocs, readFile, writeFile, createProject];
}

export type CopilotTool = ReturnType<typeof createCopilotTools>[number];
