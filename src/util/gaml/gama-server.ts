import { ChildProcess, spawn } from 'child_process';
import { dirname } from 'path';
import WebSocket from 'ws';
import { gamaHeadlessPath } from './gama-headless';

export interface GamaServerValidation {
  available: boolean;
  compiled: boolean;
  errors: string[];
}

const DEFAULT_PORT = 6868;
const START_TIMEOUT_MS = 180_000;
const CONNECT_TIMEOUT_MS = 10_000;

/** Transforme le `content` d'une réponse gama-server en liste de messages lisibles. */
export function parseErrors(content: unknown): string[] {
  if (content == null) return [];
  if (Array.isArray(content)) {
    return content.map((e) => (typeof e === 'string' ? e : extractMessage(e)));
  }
  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    if (Array.isArray(obj.errors)) {
      return obj.errors.map((e) => (typeof e === 'string' ? e : extractMessage(e)));
    }
    if (typeof obj.message === 'string') return [obj.message];
    return [JSON.stringify(obj)];
  }
  return [String(content)];
}

function extractMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
  }
  return JSON.stringify(e);
}

/**
 * Client persistant pour gama-server (mode websocket de GAMA headless).
 *
 * Démarre une seule instance de serveur (lancement ~30 s), maintient la socket
 * ouverte et réutilise la connexion pour valider plusieurs modèles. La commande
 * `validate` renvoie les VRAIES erreurs de compilation GAML (contrairement au
 * mode `-xml` qui plante avec un NullPointerException).
 */
export class GamaServerClient {
  private readonly port: number;
  private proc?: ChildProcess;
  private ws?: WebSocket;
  private connected = false;
  private startedHere = false;
  private readyPromise?: Promise<void>;
  private chain: Promise<unknown> = Promise.resolve();
  private pending?: {
    resolve: (v: GamaServerValidation) => void;
    timer: NodeJS.Timeout;
  };

  constructor(port = Number(process.env.GAMA_SERVER_PORT ?? DEFAULT_PORT)) {
    this.port = port;
  }

  isAvailable(): boolean {
    return gamaHeadlessPath() !== null;
  }

  /** Valide un modèle GAML. Les appels concurrents sont sérialisés. */
  async validate(code: string, timeoutMs = 60_000): Promise<GamaServerValidation> {
    if (!this.isAvailable()) {
      return { available: false, compiled: false, errors: ['GAMA headless introuvable'] };
    }
    const run = this.chain.then(() => this.validateOnce(code, timeoutMs));
    // On garde la chaîne vivante même en cas d'erreur, sans propager le rejet.
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async validateOnce(code: string, timeoutMs: number): Promise<GamaServerValidation> {
    try {
      await this.ensureReady();
    } catch (err) {
      return { available: true, compiled: false, errors: [`gama-server indisponible: ${(err as Error).message}`] };
    }

    return new Promise<GamaServerValidation>((resolve) => {
      const timer = setTimeout(() => {
        this.pending = undefined;
        resolve({ available: true, compiled: false, errors: ['gama-server: timeout de validation'] });
      }, timeoutMs);

      this.pending = { resolve, timer };
      this.ws!.send(JSON.stringify({ type: 'validate', expr: code, syntax: false }));
    });
  }

  private ensureReady(): Promise<void> {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (!this.readyPromise) {
      this.readyPromise = this.bootstrap().catch((err) => {
        this.readyPromise = undefined;
        throw err;
      });
    }
    return this.readyPromise;
  }

  private async bootstrap(): Promise<void> {
    // 1) On tente de réutiliser un serveur déjà lancé sur ce port.
    try {
      await this.connect();
      return;
    } catch {
      /* aucun serveur joignable : on en démarre un */
    }
    await this.startServer();
    await this.connect();
  }

  private startServer(): Promise<void> {
    const bat = gamaHeadlessPath();
    if (!bat) return Promise.reject(new Error('GAMA headless introuvable'));
    const cwd = dirname(bat);

    return new Promise<void>((resolve, reject) => {
      const proc = spawn('cmd.exe', ['/c', bat, '-socket', String(this.port)], {
        cwd,
        windowsHide: true,
      });
      this.proc = proc;
      this.startedHere = true;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`gama-server: démarrage > ${START_TIMEOUT_MS} ms`));
      }, START_TIMEOUT_MS);

      const onData = (buf: Buffer) => {
        if (/Server started/i.test(buf.toString())) {
          cleanup();
          resolve();
        }
      };
      const onExit = (codeNum: number | null) => {
        cleanup();
        reject(new Error(`gama-server s'est arrêté (code ${codeNum ?? '?'}) avant d'être prêt`));
      };
      const cleanup = () => {
        clearTimeout(timer);
        proc.stdout?.off('data', onData);
        proc.off('exit', onExit);
      };

      proc.stdout?.on('data', onData);
      proc.once('exit', onExit);
    });
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${this.port}`);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('gama-server: connexion expirée'));
      }, CONNECT_TIMEOUT_MS);

      ws.on('open', () => {
        /* on attend ConnectionSuccessful avant de se déclarer prêt */
      });
      ws.on('message', (data) => {
        let msg: { type?: string; content?: unknown };
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (msg.type === 'ConnectionSuccessful') {
          clearTimeout(timer);
          this.ws = ws;
          this.connected = true;
          resolve();
          return;
        }
        this.handleMessage(msg);
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      ws.on('close', () => {
        this.connected = false;
        this.ws = undefined;
        this.readyPromise = undefined;
      });
    });
  }

  private handleMessage(msg: { type?: string; content?: unknown }): void {
    if (!this.pending) return;
    if (msg.type === 'CommandExecutedSuccessfully') {
      this.resolvePending({ available: true, compiled: true, errors: [] });
    } else if (msg.type === 'UnableToExecuteRequest' || msg.type === 'GamaServerError') {
      this.resolvePending({ available: true, compiled: false, errors: parseErrors(msg.content) });
    }
  }

  private resolvePending(result: GamaServerValidation): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    const { resolve } = this.pending;
    this.pending = undefined;
    resolve(result);
  }

  /** Arrête proprement le serveur si c'est nous qui l'avons lancé. */
  async shutdown(): Promise<void> {
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'exit' }));
      }
    } catch {
      /* ignore */
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = undefined;
    this.connected = false;
    if (this.startedHere && this.proc && this.proc.pid) {
      try {
        spawn('taskkill', ['/pid', String(this.proc.pid), '/t', '/f'], { windowsHide: true });
      } catch {
        this.proc.kill('SIGKILL');
      }
    }
    this.proc = undefined;
    this.readyPromise = undefined;
  }
}

/** Instance partagée (le serveur GAMA est coûteux à démarrer : on le réutilise). */
export const gamaServer = new GamaServerClient();

let exitHookInstalled = false;
function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  const kill = () => {
    void gamaServer.shutdown();
  };
  process.once('SIGINT', () => {
    kill();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    kill();
    process.exit(143);
  });
  process.once('beforeExit', kill);
}
installExitHook();

export function validateWithGamaServer(code: string): Promise<GamaServerValidation> {
  return gamaServer.validate(code);
}

export function shutdownGamaServer(): Promise<void> {
  return gamaServer.shutdown();
}
