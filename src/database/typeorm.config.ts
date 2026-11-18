import type { DataSourceOptions } from 'typeorm';
import { OAuthAccount } from '../auth/oauth/oauth-account.entity';
import { ChatMessage, Conversation } from '../chat/conversation.entity';
import { PasswordResetToken } from '../auth/password-reset-token.entity';
import { Session } from '../auth/session.entity';
import { User } from '../users/user.entity';
import { CreateAuthTables1763380800000 } from './migrations/1763380800000-CreateAuthTables';
import { CreatePasswordResetTokens1763395200000 } from './migrations/1763395200000-CreatePasswordResetTokens';
import { AddOAuthAccounts1763409600000 } from './migrations/1763409600000-AddOAuthAccounts';
import { CreateConversations1763424000000 } from './migrations/1763424000000-CreateConversations';

export const ENTITIES = [
  User,
  Session,
  PasswordResetToken,
  OAuthAccount,
  Conversation,
  ChatMessage,
];
export const MIGRATIONS = [
  CreateAuthTables1763380800000,
  CreatePasswordResetTokens1763395200000,
  AddOAuthAccounts1763409600000,
  CreateConversations1763424000000,
];

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Variable d'environnement manquante : ${key}`);
  return value;
}

/**
 * Options MySQL partagées par l'application Nest et par la CLI TypeORM (migrations).
 * Aucune valeur sensible n'a de valeur par défaut : tout vient de l'environnement.
 */
export function buildDataSourceOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'mysql',
    host: required(env, 'DB_HOST'),
    port: Number(env.DB_PORT || 3306),
    username: required(env, 'DB_USER'),
    password: env.DB_PASSWORD ?? '',
    database: required(env, 'DB_NAME'),
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
  };
}
