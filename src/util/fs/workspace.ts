import { resolve, sep } from 'path';

/** Racine du workspace où sont créés les projets GAMA (configurable). */
export function workspaceRoot(): string {
  return resolve(process.cwd(), process.env.WORKSPACE_DIR ?? 'workspace');
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
