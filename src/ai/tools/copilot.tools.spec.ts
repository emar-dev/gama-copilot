import { createCopilotTools } from '../tools/copilot.tools';
import { RagService } from '../rag.service';
import { ProjectService } from '../../project/project.service';

describe('createCopilotTools', () => {
  const rag = {
    retrieveContext: jest.fn().mockResolvedValue({
      context: '[#1] extrait doc',
      sources: [{ id: 1, score: 0.9 }],
    }),
  } as unknown as RagService;

  const project = {
    readFile: jest.fn().mockResolvedValue({ path: 'workspace/A/models/m.gaml', content: 'model A' }),
    writeFile: jest.fn().mockResolvedValue({ path: 'workspace/A/models/m.gaml' }),
    createProject: jest.fn().mockResolvedValue({
      project: 'A',
      path: 'workspace/A',
      files: ['workspace/A/models/main.gaml'],
      model: { file: 'models/main.gaml', validation: { valid: true, errors: [], warnings: [] } },
      sources: [],
    }),
  } as unknown as ProjectService;

  const tools = createCopilotTools({ rag, project });

  it('expose les 4 outils attendus', () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['create_project', 'read_file', 'search_docs', 'write_file']);
  });

  it('search_docs appelle RagService', async () => {
    const t = tools.find((x) => x.name === 'search_docs')!;
    const out = await t.invoke({ query: 'species GAML' });
    expect(rag.retrieveContext).toHaveBeenCalledWith('species GAML', 6);
    expect(out).toContain('extrait doc');
  });

  it('read_file appelle ProjectService', async () => {
    const t = tools.find((x) => x.name === 'read_file')!;
    await t.invoke({ path: 'A/models/m.gaml' });
    expect(project.readFile).toHaveBeenCalledWith('A/models/m.gaml');
  });

  it('write_file appelle ProjectService', async () => {
    const t = tools.find((x) => x.name === 'write_file')!;
    await t.invoke({ path: 'A/models/m.gaml', content: 'model B' });
    expect(project.writeFile).toHaveBeenCalledWith('A/models/m.gaml', 'model B');
  });
});
