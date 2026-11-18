import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthConfig } from '../auth.config';
import {
  clearOAuthStateCookie,
  OAUTH_STATE_COOKIE,
  setAuthCookies,
  setOAuthStateCookie,
} from '../auth.cookies';
import { Public } from '../decorators';
import { isProviderId } from './oauth.providers';
import {
  OAUTH_STATE_TTL_SECONDS,
  OAuthFlowError,
  OAuthService,
  type OAuthErrorCode,
} from './oauth.service';

/**
 * Connexion avec Google / GitHub. Le navigateur est redirigé vers le fournisseur puis revient
 * sur /callback ; l'API pose alors les mêmes cookies httpOnly qu'une connexion par mot de passe
 * et renvoie vers la page de connexion du front, qui affiche la session.
 */
@Controller('auth/oauth')
@UseGuards(ThrottlerGuard)
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly oauth: OAuthService,
    private readonly config: AuthConfig,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('providers')
  providers() {
    return { providers: this.oauth.enabledProviders() };
  }

  @Public()
  @Get(':provider')
  async start(
    @Param('provider') provider: string,
    @Query('remember') remember: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!isProviderId(provider)) throw new NotFoundException();
    try {
      const { url, stateCookie } = await this.oauth.begin(
        provider,
        remember === '1' || remember === 'true',
      );
      setOAuthStateCookie(
        res,
        this.config,
        stateCookie,
        OAUTH_STATE_TTL_SECONDS,
      );
      res.redirect(302, url);
    } catch (error) {
      this.fail(res, error);
    }
  }

  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!isProviderId(provider)) throw new NotFoundException();
    const cookies =
      (req.cookies as Record<string, string | undefined> | undefined) ?? {};
    // Le state ne sert qu'une fois, quelle que soit l'issue.
    clearOAuthStateCookie(res, this.config);
    try {
      const issued = await this.oauth.complete(
        provider,
        { code, state, error },
        cookies[OAUTH_STATE_COOKIE],
        { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null },
      );
      setAuthCookies(res, this.config, issued.tokens, issued.session);
      res.redirect(302, `${this.config.frontUrl}/login`);
    } catch (err) {
      this.fail(res, err);
    }
  }

  private fail(res: Response, error: unknown): void {
    let code: OAuthErrorCode = 'provider';
    if (error instanceof OAuthFlowError) code = error.code;
    else
      this.logger.error(
        'Erreur inattendue pendant la connexion OAuth',
        error instanceof Error ? error.stack : String(error),
      );
    res.redirect(302, `${this.config.frontUrl}/login?oauth_error=${code}`);
  }
}
