import { AsyncLocalStorage } from 'async_hooks';
import { resolve, sep } from 'path';

/**
 * Espace de travail courant. Dans une requête HTTP authentifiée, WorkspaceInterceptor
 * le fixe au dossier de l'utilisateur (workspace/users/<id>) : le service de projets
 * et les outils de l'agent n'ont alors accès qu'aux fichiers de cet utilisateur.
 * Hors requête (scripts, tests de fumée), c'est la racine du workspace.
 */
const currentWorkspace = new AsyncLocalStorage<string>();

/** Racine globale du workspace (configurable via WORKSPACE_DIR). */
export function baseWorkspaceRoot(): string {
  return resolve(process.cwd(), process.env.WORKSPACE_DIR ?? 'workspace');
}

/** Dossier réservé à un utilisateur, à l'intérieur du workspace global. */
export function userWorkspaceRoot(userId: string): string {
  if (!/^[A-Za-z0-9-]+$/.test(userId)) {
    throw new Error('Identifiant utilisateur invalide');
  }
  return resolve(baseWorkspaceRoot(), 'users', userId);
}

/** Exécute fn (et tout ce qu'elle déclenche, même asynchrone) dans l'espace donné. */
export function runInWorkspace<T>(root: string, fn: () => T): T {
  return currentWorkspace.run(root, fn);
}

/** Racine du workspace où sont créés les projets GAMA : celle de l'utilisateur courant s'il y en a un. */
export function workspaceRoot(): string {
  return currentWorkspace.getStore() ?? baseWorkspaceRoot();
}

/**
 * Résout un chemin relatif DANS le workspace, en interdisant toute
 * sortie du sandbox (protection contre le path-traversal).
 */
export function resolveInWorkspace(relPath: string): string {
  if (!relPath || !relPath.trim()) {
    throw new Error('Chemin requis');
  }
  const root = workspaceRoot();
  const resolved = resolve(root, relPath);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error('Chemin invalide (hors du workspace)');
  }
  return resolved;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Valide un nom de projet/modèle (identifiant simple et sûr). */
export function assertSafeName(name: string, label = 'nom'): string {
  const value = name?.trim();
  if (!value || !NAME_RE.test(value)) {
    throw new Error(
      `${label} invalide: '${name}'. Utilise lettres, chiffres, '-' ou '_' (commence par une lettre).`,
    );
  }
  return value;
}
