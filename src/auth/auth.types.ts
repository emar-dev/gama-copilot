import type { Request } from 'express';
import type { PublicUser } from '../users/user.entity';

/** Contenu des deux JWT : l'utilisateur (sub) et la session (sid). */
export interface TokenPayload {
  sub: string;
  sid: string;
}

export interface AuthUser extends PublicUser {
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface ClientContext {
  userAgent: string | null;
  ip: string | null;
}
