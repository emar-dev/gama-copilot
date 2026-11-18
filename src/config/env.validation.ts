/**
 * Validation des variables d'environnement au démarrage.
 * L'application refuse de démarrer si un secret manque ou est trop faible,
 * plutôt que de tourner avec une valeur par défaut codée en dur.
 */
const REQUIRED = [
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;
const MIN_SECRET_LENGTH = 32;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  for (const key of REQUIRED) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} est manquant`);
    }
  }
  if (config.DB_PASSWORD === undefined) {
    errors.push(
      'DB_PASSWORD est manquant (laisser vide explicitement si le compte n’a pas de mot de passe)',
    );
  }

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = config[key];
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length < MIN_SECRET_LENGTH
    ) {
      errors.push(
        `${key} doit contenir au moins ${MIN_SECRET_LENGTH} caractères`,
      );
    }
  }
  if (
    config.JWT_ACCESS_SECRET &&
    config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET
  ) {
    errors.push(
      'JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être différents',
    );
  }

  for (const key of [
    'DB_PORT',
    'AUTH_ACCESS_TTL_SECONDS',
    'AUTH_REMEMBER_DAYS',
    'AUTH_SESSION_HOURS',
    'BCRYPT_ROUNDS',
    'RESET_TOKEN_TTL_MINUTES',
    'SMTP_PORT',
  ]) {
    const value = config[key];
    if (
      value !== undefined &&
      value !== '' &&
      !Number.isFinite(Number(value))
    ) {
      errors.push(`${key} doit être un nombre`);
    }
  }

  for (const provider of ['GOOGLE', 'GITHUB']) {
    const id = config[`${provider}_CLIENT_ID`];
    const secret = config[`${provider}_CLIENT_SECRET`];
    if (Boolean(id) !== Boolean(secret)) {
      errors.push(
        `${provider}_CLIENT_ID et ${provider}_CLIENT_SECRET doivent être renseignés ensemble`,
      );
    }
  }

  if (config.NODE_ENV === 'production' && !config.SMTP_HOST) {
    errors.push(
      'SMTP_HOST est obligatoire en production (envoi des e-mails de réinitialisation)',
    );
  }

  if (errors.length > 0) {
    throw new Error(`Configuration invalide :\n- ${errors.join('\n- ')}`);
  }
  return config;
}
