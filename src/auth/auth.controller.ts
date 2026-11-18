import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthConfig } from './auth.config';
import {
  ACCESS_COOKIE,
  clearAuthCookies,
  REFRESH_COOKIE,
  setAuthCookies,
} from './auth.cookies';
import { AuthService, type IssuedSession } from './auth.service';
import type { AuthUser, ClientContext } from './auth.types';
import { CurrentUser, Public } from './decorators';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { PasswordResetService } from './password-reset.service';

function clientOf(req: Request): ClientContext {
  return { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null };
}

function cookiesOf(req: Request): Record<string, string | undefined> {
  return (req.cookies as Record<string, string | undefined> | undefined) ?? {};
}

/**
 * Les jetons ne sortent jamais dans le corps des réponses : ils sont uniquement
 * posés en cookies httpOnly, illisibles par le JavaScript du navigateur.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
// Limite de débit (anti force brute) sur la connexion, l'inscription et la réinitialisation.
@SkipThrottle()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly config: AuthConfig,
  ) {}

  @Public()
  @SkipThrottle({ default: false })
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.register(dto, clientOf(req)));
  }

  @Public()
  @SkipThrottle({ default: false })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(dto, clientOf(req)));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = cookiesOf(req)[REFRESH_COOKIE];
    if (!token)
      throw new UnauthorizedException(
        'Votre session a expiré. Reconnectez-vous.',
      );
    try {
      return this.respond(res, await this.auth.refresh(token, clientOf(req)));
    } catch (error) {
      clearAuthCookies(res, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookies = cookiesOf(req);
    await this.auth.logout({
      accessToken: cookies[ACCESS_COOKIE],
      refreshToken: cookies[REFRESH_COOKIE],
    });
    clearAuthCookies(res, this.config);
  }

  /** Réponse identique que le compte existe ou non : rien ne révèle quelles adresses sont inscrites. */
  @Public()
  @SkipThrottle({ default: false })
  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    void this.passwordReset.request(dto.email, req.ip ?? null);
    return {
      message:
        'Si un compte existe pour cette adresse, un lien de réinitialisation vient de lui être envoyé.',
    };
  }

  /** Change le mot de passe et déconnecte tous les appareils, y compris celui-ci. */
  @Public()
  @SkipThrottle({ default: false })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.passwordReset.reset(dto.token, dto.password);
    clearAuthCookies(res, this.config);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    clearAuthCookies(res, this.config);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    const { id, email, name, createdAt } = user;
    return { user: { id, email, name, createdAt } };
  }

  private respond(res: Response, issued: IssuedSession) {
    setAuthCookies(res, this.config, issued.tokens, issued.session);
    return { user: issued.user };
  }
}
