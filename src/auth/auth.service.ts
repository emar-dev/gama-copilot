import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { toPublicUser, type PublicUser, type User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthConfig } from './auth.config';
import type { AuthUser, ClientContext, TokenPayload } from './auth.types';
import {
  MAX_PASSWORD_LENGTH,
  type LoginDto,
  type RegisterDto,
} from './dto/auth.dto';
import { Session } from './session.entity';

export interface IssuedSession {
  user: PublicUser;
  session: Session;
  tokens: { accessToken: string; refreshToken: string };
}

const INVALID_CREDENTIALS = 'E-mail ou mot de passe incorrect.';
const SESSION_EXPIRED = 'Votre session a expiré. Reconnectez-vous.';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function isDuplicateEntry(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.driverError
      ?.code ?? (error as { code?: string })?.code;
  return code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Hash factice : la vérification prend le même temps qu'un compte existe ou non. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UsersService,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly jwt: JwtService,
    private readonly config: AuthConfig,
  ) {}

  async register(
    dto: RegisterDto,
    client: ClientContext,
  ): Promise<IssuedSession> {
    this.assertPasswordBytes(dto.password);
    if (await this.users.existsByEmail(dto.email)) {
      throw new ConflictException(
        'Un compte existe déjà avec cette adresse e-mail.',
      );
    }
    const passwordHash = await hash(dto.password, this.config.bcryptRounds);
    let user: User;
    try {
      user = await this.users.create({
        email: dto.email,
        name: dto.name,
        passwordHash,
      });
    } catch (error) {
      // Deux inscriptions simultanées avec la même adresse : l'index unique tranche.
      if (isDuplicateEntry(error))
        throw new ConflictException(
          'Un compte existe déjà avec cette adresse e-mail.',
        );
      throw error;
    }
    return this.openSession(user, dto.remember ?? false, client);
  }

  async login(dto: LoginDto, client: ClientContext): Promise<IssuedSession> {
    this.assertPasswordBytes(dto.password);
    const user = await this.users.findByEmailWithPassword(dto.email);
    const valid = await compare(
      dto.password,
      user?.passwordHash ?? (await this.getDummyHash()),
    );
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);
    return this.openSession(user, dto.remember ?? false, client);
  }

  /**
   * Rotation du refresh token : chaque utilisation en émet un nouveau et invalide l'ancien.
   * Si un ancien jeton est présenté (vol probable), la session entière est révoquée.
   */
  async refresh(
    refreshToken: string,
    client: ClientContext,
  ): Promise<IssuedSession> {
    const payload = await this.verify(refreshToken, this.config.refreshSecret);
    const session = await this.sessions.findOne({
      where: { id: payload.sid },
      relations: { user: true },
    });
    if (
      !session ||
      !session.user ||
      session.userId !== payload.sub ||
      !session.isActive()
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    if (!sameHash(sha256(refreshToken), session.refreshTokenHash)) {
      session.revokedAt = new Date();
      await this.sessions.save(session);
      this.logger.warn(
        `Réutilisation d'un refresh token détectée, session ${session.id} révoquée.`,
      );
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const tokens = await this.signTokens(session);
    session.refreshTokenHash = sha256(tokens.refreshToken);
    session.lastUsedAt = new Date();
    session.userAgent = client.userAgent ?? session.userAgent;
    session.ip = client.ip ?? session.ip;
    await this.sessions.save(session);
    return { user: toPublicUser(session.user), session, tokens };
  }

  /** Appelé par le guard à chaque requête : un jeton valide ne suffit pas, la session doit l'être aussi. */
  async authenticate(accessToken: string): Promise<AuthUser> {
    const payload = await this.verify(accessToken, this.config.accessSecret);
    const session = await this.sessions.findOne({
      where: { id: payload.sid },
      relations: { user: true },
    });
    if (
      !session ||
      !session.user ||
      session.userId !== payload.sub ||
      !session.isActive()
    ) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    return { ...toPublicUser(session.user), sessionId: session.id };
  }

  /** Déconnexion de l'appareil courant. Ne lève jamais : un jeton invalide n'empêche pas de vider les cookies. */
  async logout(tokens: {
    accessToken?: string;
    refreshToken?: string;
  }): Promise<void> {
    const sessionId =
      (await this.tryDecode(tokens.refreshToken, this.config.refreshSecret)) ??
      (await this.tryDecode(tokens.accessToken, this.config.accessSecret));
    if (sessionId) {
      await this.sessions.update(
        { id: sessionId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }
  }

  /** Déconnexion de tous les appareils de l'utilisateur. */
  async logoutAll(userId: string): Promise<void> {
    await this.sessions.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Ouvre une session pour un utilisateur déjà authentifié (mot de passe ou OAuth). */
  async openSession(
    user: User,
    remember: boolean,
    client: ClientContext,
  ): Promise<IssuedSession> {
    const session = this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      remember,
      userAgent: client.userAgent?.slice(0, 255) ?? null,
      ip: client.ip?.slice(0, 45) ?? null,
      expiresAt: new Date(Date.now() + this.config.sessionLifetimeMs(remember)),
      revokedAt: null,
      lastUsedAt: new Date(),
    });
    const tokens = await this.signTokens(session);
    session.refreshTokenHash = sha256(tokens.refreshToken);
    await this.sessions.save(session);
    return { user: toPublicUser(user), session, tokens };
  }

  private async signTokens(session: Session) {
    const payload: TokenPayload = { sub: session.userId, sid: session.id };
    const refreshTtl = Math.max(
      1,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessTtlSeconds,
      }),
      // jwtid unique : deux rafraîchissements dans la même seconde donnent quand même deux jetons distincts.
      this.jwt.signAsync(payload, {
        secret: this.config.refreshSecret,
        expiresIn: refreshTtl,
        jwtid: randomUUID(),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async verify(token: string, secret: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
        throw new Error('payload');
      return payload;
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
  }

  private async tryDecode(
    token: string | undefined,
    secret: string,
  ): Promise<string | null> {
    if (!token) return null;
    try {
      // ignoreExpiration : on peut révoquer une session même avec un jeton expiré, s'il est authentique.
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret,
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
      return typeof payload.sid === 'string' ? payload.sid : null;
    } catch {
      return null;
    }
  }

  private assertPasswordBytes(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Le mot de passe ne peut pas dépasser ${MAX_PASSWORD_LENGTH} octets.`,
      );
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash(randomUUID(), this.config.bcryptRounds);
    return this.dummyHash;
  }
}
