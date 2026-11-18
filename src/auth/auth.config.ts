import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/** Paramètres d'authentification lus une fois depuis l'environnement (validé au démarrage). */
@Injectable()
export class AuthConfig {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  /** Durée de vie du jeton d'accès (cookie gc_access). */
  readonly accessTtlSeconds: number;
  /** Durée de vie d'une session « Se souvenir de moi ». */
  readonly rememberDays: number;
  /** Durée de vie d'une session sans « Se souvenir de moi » (cookie de session côté navigateur). */
  readonly sessionHours: number;
  readonly bcryptRounds: number;
  readonly cookieSecure: boolean;
  readonly cookieDomain: string | undefined;
  /** Page du front qui reçoit ?token=… depuis l'e-mail. */
  readonly passwordResetUrl: string;
  readonly resetTokenTtlMinutes: number;
  /** Adresse du front (première origine de FRONT_ORIGIN), cible des redirections OAuth. */
  readonly frontUrl: string;
  /** Adresse publique de l'API, utilisée pour construire les URL de retour OAuth. */
  readonly apiPublicUrl: string;
  /** Fournisseurs OAuth configurés (absents tant que leurs clés ne sont pas renseignées). */
  readonly oauth: Partial<Record<'google' | 'github', OAuthCredentials>>;

  constructor(config: ConfigService) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtlSeconds = Number(
      config.get('AUTH_ACCESS_TTL_SECONDS') || 900,
    );
    this.rememberDays = Number(config.get('AUTH_REMEMBER_DAYS') || 30);
    this.sessionHours = Number(config.get('AUTH_SESSION_HOURS') || 24);
    this.bcryptRounds = Number(config.get('BCRYPT_ROUNDS') || 12);
    const secure = config.get<string>('COOKIE_SECURE');
    this.cookieSecure = secure
      ? secure === 'true'
      : config.get('NODE_ENV') === 'production';
    this.cookieDomain = config.get<string>('COOKIE_DOMAIN') || undefined;
    const front = (
      config.get<string>('FRONT_ORIGIN') || 'http://localhost:3001'
    )
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
    this.frontUrl = front;
    this.passwordResetUrl =
      config.get<string>('PASSWORD_RESET_URL') || `${front}/reset-password`;
    this.apiPublicUrl = (
      config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${config.get<string>('PORT') || 3000}`
    ).replace(/\/$/, '');
    this.oauth = {};
    for (const provider of ['google', 'github'] as const) {
      const prefix = provider.toUpperCase();
      const clientId = config.get<string>(`${prefix}_CLIENT_ID`);
      const clientSecret = config.get<string>(`${prefix}_CLIENT_SECRET`);
      if (clientId && clientSecret)
        this.oauth[provider] = { clientId, clientSecret };
    }
    this.resetTokenTtlMinutes = Number(
      config.get('RESET_TOKEN_TTL_MINUTES') || 30,
    );
  }

  sessionLifetimeMs(remember: boolean): number {
    return remember
      ? this.rememberDays * 24 * 3600 * 1000
      : this.sessionHours * 3600 * 1000;
  }
}
