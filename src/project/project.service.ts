import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { GamlService } from '../ai/gaml.service';
import { gamaServer } from '../util/gaml/gama-server';
import { GamlValidation, validateGaml } from '../util/gaml/validate';
import {
  assertSafeName,
  baseWorkspaceRoot,
  resolveInWorkspace,
  workspaceRoot,
} from '../util/fs/workspace';
import { summarizeGaml, type GamlSummary } from './gaml-summary';
import { gamaProjectDescriptor, PROJECT_DIRS } from './templates';

export interface ProjectInfo {
  name: string;
  /** Modèle principal (models/<nom>.gaml de préférence), chemin relatif au workspace. */
  mainModel: string | null;
  files: number;
  updatedAt: string;
}

export interface ProjectFileInfo {
  path: string;
  size: number;
  updatedAt: string;
}

export interface ModelValidation extends GamlValidation {
  file: string;
  validatedBy: 'gama' | 'heuristic';
}

const MAX_FILES = 500;

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
  async updateFile(
    relPath: string,
    content: string,
  ): Promise<{ path: string }> {
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
  async createStructure(
    name: string,
  ): Promise<{ project: string; path: string; files: string[] }> {
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
  async createProject(
    name: string,
    description: string,
  ): Promise<CreateProjectResult> {
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

  /** Projets de l'espace courant (dossiers de premier niveau du workspace). */
  async listProjects(): Promise<ProjectInfo[]> {
    const root = workspaceRoot();
    let entries: import('fs').Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }
    const atBase = root === baseWorkspaceRoot();
    const projects: ProjectInfo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      // À la racine globale, « users » contient les espaces personnels, pas un projet.
      if (atBase && entry.name === 'users') continue;
      const files = await this.listFiles(entry.name);
      const models = files.filter((f) => f.path.endsWith('.gaml'));
      const preferred = `${entry.name}/models/${entry.name}.gaml`;
      projects.push({
        name: entry.name,
        mainModel:
          models.find((f) => f.path === preferred)?.path ??
          models[0]?.path ??
          null,
        files: files.length,
        updatedAt: files.reduce(
          (latest, f) => (f.updatedAt > latest ? f.updatedAt : latest),
          new Date(0).toISOString(),
        ),
      });
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Fichiers d'un projet (hors fichiers et dossiers cachés), chemins relatifs au workspace. */
  async listFiles(project: string): Promise<ProjectFileInfo[]> {
    const name = this.safeName(project, 'nom de projet');
    const dir = this.safeResolve(name);
    const files: ProjectFileInfo[] = [];
    const walk = async (current: string): Promise<void> => {
      let entries: import('fs').Dirent[];
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (files.length >= MAX_FILES || entry.name.startsWith('.')) continue;
        const abs = join(current, entry.name);
        if (entry.isDirectory()) await walk(abs);
        else if (entry.isFile()) {
          const info = await stat(abs);
          files.push({
            path: this.toWorkspacePath(abs),
            size: info.size,
            updatedAt: info.mtime.toISOString(),
          });
        }
      }
    };
    try {
      if (!(await stat(dir)).isDirectory()) throw new Error();
    } catch {
      throw new NotFoundException(`Projet introuvable: ${name}`);
    }
    await walk(dir);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Structure du modèle (espèces, expériences…) lue depuis le GAML. */
  async summary(
    project: string,
    file?: string,
  ): Promise<{ file: string; summary: GamlSummary }> {
    const path = await this.modelPath(project, file);
    const { content } = await this.readFile(path);
    return { file: path, summary: summarizeGaml(content) };
  }

  /** Compile le modèle avec gama-server si GAMA est installé, sinon contrôle heuristique. */
  async validate(project: string, file?: string): Promise<ModelValidation> {
    const path = await this.modelPath(project, file);
    const { content } = await this.readFile(path);
    if (gamaServer.isAvailable()) {
      const result = await gamaServer.validate(content);
      if (result.available) {
        return {
          file: path,
          validatedBy: 'gama',
          valid: result.compiled,
          errors: result.errors,
          warnings: [],
        };
      }
    }
    return { file: path, validatedBy: 'heuristic', ...validateGaml(content) };
  }

  private async modelPath(project: string, file?: string): Promise<string> {
    const name = this.safeName(project, 'nom de projet');
    if (file) {
      if (!file.endsWith('.gaml') || !file.startsWith(`${name}/`)) {
        throw new BadRequestException(
          `Le fichier doit être un .gaml du projet ${name}`,
        );
      }
      return file;
    }
    const projects = await this.listProjects();
    const main = projects.find((p) => p.name === name);
    if (!main) throw new NotFoundException(`Projet introuvable: ${name}`);
    if (!main.mainModel) {
      throw new NotFoundException(
        `Le projet ${name} ne contient aucun modèle .gaml`,
      );
    }
    return main.mainModel;
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
