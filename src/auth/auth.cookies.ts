import type { CookieOptions, Response } from 'express';
import type { AuthConfig } from './auth.config';

export const ACCESS_COOKIE = 'gc_access';
export const REFRESH_COOKIE = 'gc_refresh';
/** Le refresh token n'est envoyé qu'aux routes /auth, jamais au reste de l'API. */
export const REFRESH_COOKIE_PATH = '/auth';

function baseOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    domain: config.cookieDomain,
  };
}

export function setAuthCookies(
  res: Response,
  config: AuthConfig,
  tokens: { accessToken: string; refreshToken: string },
  session: { remember: boolean; expiresAt: Date },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(config),
    path: '/',
    maxAge: config.accessTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(config),
    path: REFRESH_COOKIE_PATH,
    // Sans « Se souvenir de moi », cookie de session : il disparaît à la fermeture du navigateur.
    ...(session.remember ? { expires: session.expiresAt } : {}),
  });
}

export function clearAuthCookies(res: Response, config: AuthConfig): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(config), path: '/' });
  res.clearCookie(REFRESH_COOKIE, {
    ...baseOptions(config),
    path: REFRESH_COOKIE_PATH,
  });
}

/** state + vérificateur PKCE du parcours OAuth en cours, lu uniquement au retour du fournisseur. */
export const OAUTH_STATE_COOKIE = 'gc_oauth';
const OAUTH_STATE_PATH = '/auth/oauth';

export function setOAuthStateCookie(
  res: Response,
  config: AuthConfig,
  value: string,
  ttlSeconds: number,
): void {
  // SameSite=Lax : le cookie est bien renvoyé lors du retour du fournisseur (navigation GET de premier niveau).
  res.cookie(OAUTH_STATE_COOKIE, value, {
    ...baseOptions(config),
    path: OAUTH_STATE_PATH,
    maxAge: ttlSeconds * 1000,
  });
}

export function clearOAuthStateCookie(res: Response, config: AuthConfig): void {
  res.clearCookie(OAUTH_STATE_COOKIE, {
    ...baseOptions(config),
    path: OAUTH_STATE_PATH,
  });
}
