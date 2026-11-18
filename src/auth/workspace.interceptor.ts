import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { mkdir } from 'fs/promises';
import { Observable } from 'rxjs';
import { runInWorkspace, userWorkspaceRoot } from '../util/fs/workspace';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Exécute chaque requête authentifiée dans l'espace de travail de son utilisateur.
 * Les guards passent avant les intercepteurs : req.user est déjà posé par JwtAuthGuard.
 */
@Injectable()
export class WorkspaceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>().user;
    if (!user) return next.handle();

    const root = userWorkspaceRoot(user.id);
    return new Observable((subscriber) => {
      let subscription: { unsubscribe(): void } | undefined;
      runInWorkspace(root, () => {
        mkdir(root, { recursive: true })
          .then(() => {
            subscription = next.handle().subscribe(subscriber);
          })
          .catch((error: unknown) => subscriber.error(error));
      });
      return () => subscription?.unsubscribe();
    });
  }
}
