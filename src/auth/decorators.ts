import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';

/** Ouvre une route sans authentification (toutes les autres sont protégées par défaut). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injecte l'utilisateur connecté (posé par JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  },
);
