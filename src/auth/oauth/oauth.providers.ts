import type { OAuthCredentials } from '../auth.config';
import type { OAuthProviderId } from './oauth-account.entity';

/** Profil normalisé, quel que soit le fournisseur. */
export interface OAuthProfile {
  providerUserId: string;
  /** Adresse vérifiée par le fournisseur, ou null s'il n'en a aucune. */
  email: string | null;
  name: string | null;
}

/** Erreur côté fournisseur (refus, réponse inattendue…) : se traduit par un code d'erreur pour le front. */
export class OAuthProviderError extends Error {}

interface AuthorizeParams {
  credentials: OAuthCredentials;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

interface ExchangeParams {
  credentials: OAuthCredentials;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export interface OAuthProvider {
  id: OAuthProviderId;
  label: string;
  authorizeUrl(params: AuthorizeParams): string;
  fetchProfile(params: ExchangeParams): Promise<OAuthProfile>;
}

const TIMEOUT_MS = 10_000;

async function getJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || body === null) {
    throw new OAuthProviderError(`${url} a répondu ${res.status}`);
  }
  return body;
}

const google: OAuthProvider = {
  id: 'google',
  label: 'Google',
  authorizeUrl({ credentials, redirectUri, state, codeChallenge }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return url.toString();
  },
  async fetchProfile({ credentials, redirectUri, code, codeVerifier }) {
    const token = await getJson<{ access_token?: string }>(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      },
    );
    if (!token.access_token)
      throw new OAuthProviderError('Google : pas de jeton');

    const info = await getJson<{
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    }>('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!info.sub) throw new OAuthProviderError('Google : profil incomplet');
    return {
      providerUserId: info.sub,
      email: info.email && info.email_verified === true ? info.email : null,
      name: info.name ?? null,
    };
  },
};

const github: OAuthProvider = {
  id: 'github',
  label: 'GitHub',
  authorizeUrl({ credentials, redirectUri, state }) {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: credentials.clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
      allow_signup: 'true',
    }).toString();
    return url.toString();
  },
  async fetchProfile({ credentials, redirectUri, code }) {
    const token = await getJson<{ access_token?: string; error?: string }>(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );
    if (!token.access_token) {
      throw new OAuthProviderError(`GitHub : ${token.error ?? 'pas de jeton'}`);
    }
    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GAMA-Copilot',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const user = await getJson<{
      id?: number;
      login?: string;
      name?: string | null;
    }>('https://api.github.com/user', { headers });
    if (typeof user.id !== 'number')
      throw new OAuthProviderError('GitHub : profil incomplet');

    // L'adresse publique du profil peut être absente ou non vérifiée : on prend la principale vérifiée.
    const emails = await getJson<
      { email: string; primary: boolean; verified: boolean }[]
    >('https://api.github.com/user/emails', { headers });
    const verified = Array.isArray(emails)
      ? (emails.find((e) => e.primary && e.verified) ??
        emails.find((e) => e.verified))
      : undefined;

    return {
      providerUserId: String(user.id),
      email: verified?.email ?? null,
      name: user.name || user.login || null,
    };
  },
};

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProvider> = {
  google,
  github,
};

export function isProviderId(value: string): value is OAuthProviderId {
  return value === 'google' || value === 'github';
}
