import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { GamlService } from '../ai/gaml.service';
import { GamlValidation } from '../util/gaml/validate';
import { assertSafeName, resolveInWorkspace, workspaceRoot } from '../util/fs/workspace';
import { gamaProjectDescriptor, PROJECT_DIRS } from './templates';

export interface CreateProjectResult {
  project: string;
  path: string;
  files: string[];
  model: { file: string; validation: GamlValidation };
  sources: { id: number; score: number }[];
}

@Injectable()
export class ProjectService {
  constructor(private readonly gaml: GamlService) {}

  /** J16 : écrit un fichier (crée les dossiers parents au besoin). */
  async writeFile(relPath: string, content: string): Promise<{ path: string }> {
    const abs = this.safeResolve(relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content ?? '', 'utf-8');
    return { path: this.toWorkspacePath(abs) };
  }

  /** J17 : lit un fichier du workspace. */
  async readFile(relPath: string): Promise<{ path: string; content: string }> {
    const abs = this.safeResolve(relPath);
    try {
      const content = await readFile(abs, 'utf-8');
      return { path: this.toWorkspacePath(abs), content };
    } catch {
      throw new NotFoundException(`Fichier introuvable: ${relPath}`);
    }
  }

  /** J18 : met à jour un fichier existant (refuse la création implicite). */
  async updateFile(relPath: string, content: string): Promise<{ path: string }> {
    const abs = this.safeResolve(relPath);
    try {
      await readFile(abs, 'utf-8');
    } catch {
      throw new NotFoundException(`Fichier introuvable: ${relPath}`);
    }
    await writeFile(abs, content ?? '', 'utf-8');
    return { path: this.toWorkspacePath(abs) };
  }

  /** J15/J19 : crée la structure d'un projet GAMA vide (.project + dossiers). */
  async createStructure(name: string): Promise<{ project: string; path: string; files: string[] }> {
    const safe = this.safeName(name, 'nom de projet');
    const projectDir = this.safeResolve(safe);

    await mkdir(projectDir, { recursive: true });
    for (const dir of PROJECT_DIRS) {
      await mkdir(join(projectDir, dir), { recursive: true });
    }
    const dotProject = join(projectDir, '.project');
    await writeFile(dotProject, gamaProjectDescriptor(safe), 'utf-8');

    return {
      project: safe,
      path: this.toWorkspacePath(projectDir),
      files: [this.toWorkspacePath(dotProject)],
    };
  }

  /** J20 : crée un projet complet = structure + modèle GAML généré depuis une description. */
  async createProject(name: string, description: string): Promise<CreateProjectResult> {
    const safe = this.safeName(name, 'nom de projet');
    if (!description?.trim()) {
      throw new BadRequestException('description is required');
    }

    const structure = await this.createStructure(safe);
    const generated = await this.gaml.generate(description);

    const modelRel = join(safe, 'models', `${safe}.gaml`);
    const { path: modelPath } = await this.writeFile(modelRel, generated.code);

    return {
      project: safe,
      path: structure.path,
      files: [...structure.files, modelPath],
      model: { file: modelPath, validation: generated.validation },
      sources: generated.sources,
    };
  }

  private safeResolve(relPath: string): string {
    try {
      return resolveInWorkspace(relPath);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  private safeName(name: string, label: string): string {
    try {
      return assertSafeName(name, label);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  private toWorkspacePath(abs: string): string {
    return relative(workspaceRoot(), abs).split('\\').join('/');
  }
}
