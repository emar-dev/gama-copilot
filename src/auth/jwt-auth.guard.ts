import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_COOKIE } from './auth.cookies';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * Guard global : toute route est protégée sauf celles marquées @Public().
 * Le jeton d'accès est lu uniquement dans le cookie httpOnly, jamais dans un en-tête.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (request.cookies as Record<string, string> | undefined)?.[
      ACCESS_COOKIE
    ];
    if (!token)
      throw new UnauthorizedException('Connectez-vous pour continuer.');

    request.user = await this.auth.authenticate(token);
    return true;
  }
}
