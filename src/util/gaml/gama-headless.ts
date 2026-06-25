import { execFile } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { promisify } from 'util';

const pExecFile = promisify(execFile);

export interface GamaValidationResult {
  available: boolean;
  compiled: boolean;
  exitCode?: number;
  output: string;
}

/** Chemin du lanceur gama-headless (configurable via GAMA_HEADLESS). */
export function gamaHeadlessPath(): string | null {
  const configured = process.env.GAMA_HEADLESS;
  const candidate = configured ?? 'C:\\Program Files\\Gama\\headless\\gama-headless.bat';
  return existsSync(candidate) ? candidate : null;
}

export function isGamaAvailable(): boolean {
  return gamaHeadlessPath() !== null;
}

/** Extrait le nom du premier experiment déclaré dans un modèle GAML. */
export function extractExperimentName(code: string): string | undefined {
  return code.match(/\bexperiment\s+([A-Za-z]\w*)/)?.[1];
}

function listWorkDirs(dir: string): Set<string> {
  try {
    return new Set(readdirSync(dir).filter((n) => n.startsWith('.work')));
  } catch {
    return new Set();
  }
}

function cleanupNewWorkDirs(dir: string, before: Set<string>): void {
  try {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.work') && !before.has(name)) {
        rmSync(join(dir, name), { recursive: true, force: true });
      }
    }
  } catch {
    /* best effort */
  }
}

function summarize(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .filter((l) => /compiled|error|warning/i.test(l) && !l.includes('-D') && !l.includes('--add-'));
  return lines.slice(-8).join('\n').trim() || stdout.slice(-400).trim();
}

/**
 * Valide un modèle GAML en le compilant avec GAMA (mode headless).
 * Compile == GAMA produit le fichier XML d'expérimentation sans erreur.
 */
export async function validateWithGama(
  code: string,
  timeoutMs = 90000,
): Promise<GamaValidationResult> {
  const bat = gamaHeadlessPath();
  if (!bat) {
    return { available: false, compiled: false, output: 'GAMA headless introuvable' };
  }

  const experiment = extractExperimentName(code);
  if (!experiment) {
    return { available: true, compiled: false, output: "Aucun 'experiment' trouvé dans le modèle" };
  }

  const headlessDir = dirname(bat);
  const work = mkdtempSync(join(tmpdir(), 'gamaval-'));
  const modelPath = join(work, 'model.gaml');
  const outXml = join(work, 'out.xml');
  writeFileSync(modelPath, code, 'utf-8');

  const before = listWorkDirs(headlessDir);
  let stdout = '';
  let exitCode = 0;
  try {
    const res = await pExecFile('cmd.exe', ['/c', bat, '-xml', experiment, modelPath, outXml], {
      cwd: headlessDir,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = res.stdout ?? '';
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    stdout = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
    exitCode = typeof e.code === 'number' ? e.code : 1;
  }

  const compiled = existsSync(outXml);
  cleanupNewWorkDirs(headlessDir, before);
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  return { available: true, compiled, exitCode, output: summarize(stdout) };
}
