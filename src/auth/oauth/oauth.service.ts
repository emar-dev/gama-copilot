import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { normalizeEmail } from '../../users/users.service';
import { AuthConfig } from '../auth.config';
import { AuthService, type IssuedSession } from '../auth.service';
import type { ClientContext } from '../auth.types';
import { OAuthAccount, type OAuthProviderId } from './oauth-account.entity';
import { OAUTH_PROVIDERS, type OAuthProfile } from './oauth.providers';

/** Codes renvoyés au front dans ?oauth_error=… ; le texte affiché est choisi côté front. */
export type OAuthErrorCode =
  | 'disabled'
  | 'cancelled'
  | 'state'
  | 'email'
  | 'provider';

export class OAuthFlowError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

/** Contenu du cookie gc_oauth, signé, posé au départ vers le fournisseur et lu au retour. */
interface OAuthState {
  provider: OAuthProviderId;
  state: string;
  verifier: string;
  remember: boolean;
}

const STATE_AUDIENCE = 'gc-oauth-state';
export const OAUTH_STATE_TTL_SECONDS = 600;

function base64UrlSha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isDuplicateEntry(error: unknown): boolean {
  const e = error as { code?: string; driverError?: { code?: string } };
  return (e?.driverError?.code ?? e?.code) === 'ER_DUP_ENTRY';
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly config: AuthConfig,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    @InjectRepository(OAuthAccount)
    private readonly accounts: Repository<OAuthAccount>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  enabledProviders(): OAuthProviderId[] {
    return (['google', 'github'] as const).filter((p) => this.config.oauth[p]);
  }

  redirectUri(provider: OAuthProviderId): string {
    return `${this.config.apiPublicUrl}/auth/oauth/${provider}/callback`;
  }

  /** Prépare la redirection vers le fournisseur : state anti-CSRF et vérificateur PKCE. */
  async begin(
    provider: OAuthProviderId,
    remember: boolean,
  ): Promise<{ url: string; stateCookie: string }> {
    const credentials = this.config.oauth[provider];
    if (!credentials) throw new OAuthFlowError('disabled');

    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const payload: OAuthState = { provider, state, verifier, remember };
    const stateCookie = await this.jwt.signAsync(payload, {
      secret: this.config.accessSecret,
      audience: STATE_AUDIENCE,
      expiresIn: OAUTH_STATE_TTL_SECONDS,
    });
    const url = OAUTH_PROVIDERS[provider].authorizeUrl({
      credentials,
      redirectUri: this.redirectUri(provider),
      state,
      codeChallenge: base64UrlSha256(verifier),
    });
    return { url, stateCookie };
  }

  /** Retour du fournisseur : vérifie le state, récupère le profil, puis ouvre une session. */
  async complete(
    provider: OAuthProviderId,
    query: { code?: string; state?: string; error?: string },
    stateCookie: string | undefined,
    client: ClientContext,
  ): Promise<IssuedSession> {
    const credentials = this.config.oauth[provider];
    if (!credentials) throw new OAuthFlowError('disabled');
    if (query.error) throw new OAuthFlowError('cancelled', query.error);

    const saved = await this.readState(stateCookie);
    if (
      !saved ||
      saved.provider !== provider ||
      !query.state ||
      !sameString(query.state, saved.state)
    ) {
      throw new OAuthFlowError('state');
    }
    if (!query.code) throw new OAuthFlowError('provider', 'code absent');

    let profile: OAuthProfile;
    try {
      profile = await OAUTH_PROVIDERS[provider].fetchProfile({
        credentials,
        redirectUri: this.redirectUri(provider),
        code: query.code,
        codeVerifier: saved.verifier,
      });
    } catch (error) {
      this.logger.warn(
        `Échec de l'échange OAuth ${provider} : ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new OAuthFlowError('provider');
    }

    const user = await this.resolveUser(provider, profile);
    return this.auth.openSession(user, saved.remember, client);
  }

  private async readState(
    token: string | undefined,
  ): Promise<OAuthState | null> {
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync<OAuthState>(token, {
        secret: this.config.accessSecret,
        audience: STATE_AUDIENCE,
        algorithms: ['HS256'],
      });
    } catch {
      return null;
    }
  }

  /**
   * Identité déjà liée → son compte. Sinon, l'adresse vérifiée par le fournisseur
   * rattache l'identité au compte existant de même adresse, ou crée un compte sans mot de passe.
   */
  private async resolveUser(
    provider: OAuthProviderId,
    profile: OAuthProfile,
    retried = false,
  ): Promise<User> {
    const linked = await this.accounts.findOne({
      where: { provider, providerUserId: profile.providerUserId },
      relations: { user: true },
    });
    if (linked?.user) {
      if (profile.email && profile.email !== linked.email) {
        await this.accounts.update(linked.id, { email: profile.email });
      }
      return linked.user;
    }

    if (!profile.email) throw new OAuthFlowError('email');
    const email = normalizeEmail(profile.email);

    try {
      return await this.dataSource.transaction(async (manager) => {
        let user = await manager.findOne(User, { where: { email } });
        if (!user) {
          const name = (profile.name?.trim() || email.split('@')[0]).slice(
            0,
            100,
          );
          user = await manager.save(
            manager.create(User, { email, name, passwordHash: null }),
          );
        }
        await manager.save(
          manager.create(OAuthAccount, {
            userId: user.id,
            provider,
            providerUserId: profile.providerUserId,
            email,
          }),
        );
        return user;
      });
    } catch (error) {
      // Deux retours simultanés pour la même identité : l'autre a gagné, on relit.
      if (isDuplicateEntry(error) && !retried) {
        return this.resolveUser(provider, profile, true);
      }
      throw error;
    }
  }
}
