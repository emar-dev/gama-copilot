import { mkdtemp, rm, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectService } from './project.service';
import { GamlService } from '../ai/gaml.service';

describe('ProjectService', () => {
  let dir: string;
  let service: ProjectService;
  const gamlMock = {
    generate: jest.fn().mockResolvedValue({
      code: 'model Demo\nglobal { }\nspecies A { }\nexperiment E type: gui { }',
      validation: { valid: true, errors: [], warnings: [] },
      sources: [{ id: 1, score: 0.5 }],
    }),
  } as unknown as GamlService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ws-'));
    process.env.WORKSPACE_DIR = dir;
    service = new ProjectService(gamlMock);
  });

  afterEach(async () => {
    delete process.env.WORKSPACE_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it('writes and reads a file (J16/J17)', async () => {
    await service.writeFile('foo/bar.txt', 'hello');
    const { content } = await service.readFile('foo/bar.txt');
    expect(content).toBe('hello');
  });

  it('updates only existing files (J18)', async () => {
    await expect(service.updateFile('missing.txt', 'x')).rejects.toThrow();
    await service.writeFile('a.txt', 'v1');
    await service.updateFile('a.txt', 'v2');
    expect((await service.readFile('a.txt')).content).toBe('v2');
  });

  it('rejects path traversal outside the workspace', async () => {
    await expect(service.writeFile('../escape.txt', 'x')).rejects.toThrow();
    await expect(service.readFile('../../etc/passwd')).rejects.toThrow();
  });

  it('rejects invalid project names', async () => {
    await expect(service.createProject('../evil', 'desc')).rejects.toThrow();
    await expect(service.createProject('1bad', 'desc')).rejects.toThrow();
  });

  it('creates the GAMA project structure (J15/J19)', async () => {
    const res = await service.createStructure('MyProj');
    const project = join(dir, 'MyProj');
    expect((await stat(join(project, 'models'))).isDirectory()).toBe(true);
    expect((await stat(join(project, 'includes'))).isDirectory()).toBe(true);
    const dotProject = await readFile(join(project, '.project'), 'utf-8');
    expect(dotProject).toContain('msi.gama.application.gamaNature');
    expect(dotProject).toContain('<name>MyProj</name>');
    expect(res.files.some((f) => f.endsWith('.project'))).toBe(true);
  });

  it('creates a full project with a generated model (J20)', async () => {
    const res = await service.createProject('Sim', 'un modèle de test');
    expect(gamlMock.generate).toHaveBeenCalledWith('un modèle de test');
    const model = await readFile(join(dir, 'Sim', 'models', 'Sim.gaml'), 'utf-8');
    expect(model).toContain('model Demo');
    expect(res.model.validation.valid).toBe(true);
    expect(res.files).toContain('Sim/models/Sim.gaml');
  });
});
