/**
 * Tests de bout en bout de l'authentification, sur une vraie base MySQL de test
 * (DB_NAME + "_test", vidée à chaque exécution). Nécessite MySQL et le fichier .env.
 */
import 'dotenv/config';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { createConnection } from 'mysql2/promise';
import { createHash } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IsNull, type Repository } from 'typeorm';
import { configureApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import type { AuthUser } from '../src/auth/auth.types';
import { CurrentUser } from '../src/auth/decorators';
import { PasswordResetToken } from '../src/auth/password-reset-token.entity';
import { Session } from '../src/auth/session.entity';
import { validateEnv } from '../src/config/env.validation';
import { buildDataSourceOptions } from '../src/database/typeorm.config';
import { MailService, type MailMessage } from '../src/mail/mail.service';

@Controller('protected')
class ProtectedController {
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return { email: user.email };
  }
}

const TEST_DB = `${process.env.DB_NAME}_test`;

/** Remplace l'envoi SMTP : garde les e-mails en mémoire pour lire les liens. */
const outbox: MailMessage[] = [];
const mailStub = {
  isConfigured: true,
  send: (message: MailMessage) => {
    outbox.push(message);
    return Promise.resolve();
  },
};

/** La demande de réinitialisation est traitée en arrière-plan : on attend l'e-mail. */
async function waitForMail(to: string, count: number): Promise<MailMessage> {
  for (let i = 0; i < 100; i++) {
    const mails = outbox.filter((m) => m.to === to);
    if (mails.length >= count) return mails[count - 1];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`aucun e-mail n°${count} pour ${to}`);
}

function tokenFrom(mail: MailMessage): string {
  const match = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(mail.text);
  if (!match) throw new Error('lien absent de l’e-mail');
  return match[1];
}

interface UserBody {
  user: { id: string; email: string; name: string; createdAt: string };
}
interface ErrorBody {
  message: string | string[];
}
const userOf = (res: request.Response) => (res.body as UserBody).user;
const messageOf = (res: request.Response) => (res.body as ErrorBody).message;

function cookieHeaders(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown;
  return Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === 'string'
      ? [raw]
      : [];
}

function findCookie(res: request.Response, name: string): string | undefined {
  return cookieHeaders(res).find((c) => c.startsWith(`${name}=`));
}

function cookieValue(res: request.Response, name: string): string {
  const cookie = findCookie(res, name);
  if (!cookie) throw new Error(`cookie ${name} absent`);
  return cookie.split(';')[0].slice(name.length + 1);
}

describe('Authentification (e2e)', () => {
  let app: INestApplication<App>;
  let sessions: Repository<Session>;
  let resetTokens: Repository<PasswordResetToken>;
  const password = 'motdepasse-solide';

  beforeAll(async () => {
    process.env.BCRYPT_ROUNDS = '4';
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    process.env.COOKIE_SECURE = 'false';
    process.env.FRONT_ORIGIN = 'http://localhost:3001';
    process.env.API_PUBLIC_URL = 'http://localhost:3000';
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.GITHUB_CLIENT_ID = 'github-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'github-client-secret';

    const admin = await createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ?? '',
    });
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await admin.end();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        TypeOrmModule.forRoot({
          ...buildDataSourceOptions({ ...process.env, DB_NAME: TEST_DB }),
          dropSchema: true,
          migrationsRun: true,
        }),
        AuthModule,
      ],
      controllers: [ProtectedController],
    })
      .overrideProvider(MailService)
      .useValue(mailStub)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    sessions = moduleRef.get(getRepositoryToken(Session));
    resetTokens = moduleRef.get(getRepositoryToken(PasswordResetToken));
    // Création de la base, suppression du schéma et migrations : plus long que les 5 s par défaut.
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const register = (
    agent: ReturnType<typeof request.agent>,
    email: string,
    extra: object = {},
  ) =>
    agent
      .post('/auth/register')
      .send({ name: 'Ada Lovelace', email, password, ...extra });

  it('inscrit un utilisateur et pose les cookies httpOnly sans exposer de jeton dans le corps', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await register(agent, '  Ada@Labo.FR ').expect(201);

    // Le corps ne contient que l'utilisateur public, rien d'autre.
    expect(Object.keys(res.body as object)).toEqual(['user']);
    const user = userOf(res);
    expect(Object.keys(user).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
    ]);
    expect(user.email).toBe('ada@labo.fr');
    expect(user.name).toBe('Ada Lovelace');
    expect(typeof user.id).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(/password|token|eyJ/i);

    const access = findCookie(res, 'gc_access')!;
    const refresh = findCookie(res, 'gc_refresh')!;
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/SameSite=Lax/);
    expect(access).toMatch(/Path=\//);
    expect(refresh).toMatch(/HttpOnly/);
    expect(refresh).toMatch(/Path=\/auth/);
    // Sans « Se souvenir de moi » : cookie de session, sans date d'expiration.
    expect(refresh).not.toMatch(/Expires=/);

    await agent.get('/auth/me').expect(200, { user: userOf(res) });
    await agent.get('/protected').expect(200, { email: 'ada@labo.fr' });
  });

  it('refuse les routes protégées sans cookie', async () => {
    await request(app.getHttpServer()).get('/protected').expect(401);
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it("ignore un jeton envoyé dans l'en-tête Authorization", async () => {
    const res = await register(
      request.agent(app.getHttpServer()),
      'bearer@labo.fr',
    ).expect(201);
    const token = cookieValue(res, 'gc_access');
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('refuse une deuxième inscription avec la même adresse, quelle que soit la casse', async () => {
    await register(request.agent(app.getHttpServer()), 'double@labo.fr').expect(
      201,
    );
    const res = await register(
      request.agent(app.getHttpServer()),
      'DOUBLE@labo.fr',
    ).expect(409);
    expect(messageOf(res)).toBe(
      'Un compte existe déjà avec cette adresse e-mail.',
    );
  });

  it('valide les données envoyées', async () => {
    const server = app.getHttpServer();
    const bad = await request(server)
      .post('/auth/register')
      .send({ name: 'A', email: 'x@y.z', password })
      .expect(400);
    expect(messageOf(bad)).toContain(
      'Le nom doit contenir entre 2 et 100 caractères.',
    );
    await request(server)
      .post('/auth/register')
      .send({ name: 'Ada', email: 'pas-un-email', password })
      .expect(400);
    await request(server)
      .post('/auth/register')
      .send({ name: 'Ada', email: 'a@b.fr', password: 'court' })
      .expect(400);
    await request(server)
      .post('/auth/login')
      .send({ email: 'a@b.fr', password, admin: true })
      .expect(400);
  });

  it('renvoie le même message pour un mauvais mot de passe et un compte inconnu', async () => {
    await register(request.agent(app.getHttpServer()), 'login@labo.fr').expect(
      201,
    );
    const server = app.getHttpServer();
    const wrong = await request(server)
      .post('/auth/login')
      .send({ email: 'login@labo.fr', password: 'mauvais-mdp' })
      .expect(401);
    const unknown = await request(server)
      .post('/auth/login')
      .send({ email: 'inconnu@labo.fr', password })
      .expect(401);
    expect(messageOf(wrong)).toBe('E-mail ou mot de passe incorrect.');
    expect(messageOf(unknown)).toBe(messageOf(wrong));

    const ok = await request(server)
      .post('/auth/login')
      .send({ email: 'LOGIN@labo.fr', password, remember: true })
      .expect(200);
    // Avec « Se souvenir de moi » : cookie persistant d'environ 30 jours.
    const expires = /Expires=([^;]+)/.exec(findCookie(ok, 'gc_refresh')!)?.[1];
    const days = (new Date(expires!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('fait tourner le refresh token et révoque la session si un ancien jeton est rejoué', async () => {
    const agent = request.agent(app.getHttpServer());
    const first = await register(agent, 'rotation@labo.fr').expect(201);
    const oldRefresh = cookieValue(first, 'gc_refresh');

    const refreshed = await agent.post('/auth/refresh').expect(200);
    expect(userOf(refreshed).email).toBe('rotation@labo.fr');
    expect(cookieValue(refreshed, 'gc_refresh')).not.toBe(oldRefresh);
    await agent.get('/auth/me').expect(200);

    // Rejeu de l'ancien refresh token : considéré comme un vol, la session est coupée.
    const replay = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `gc_refresh=${oldRefresh}`)
      .expect(401);
    expect(findCookie(replay, 'gc_refresh')).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
    await agent.get('/auth/me').expect(401);
    await agent.post('/auth/refresh').expect(401);
  });

  it("n'accepte pas un jeton d'accès à la place d'un refresh token", async () => {
    const res = await register(
      request.agent(app.getHttpServer()),
      'swap@labo.fr',
    ).expect(201);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `gc_refresh=${cookieValue(res, 'gc_access')}`)
      .expect(401);
  });

  it('déconnecte la session courante, côté serveur comme côté navigateur', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await register(agent, 'logout@labo.fr').expect(201);
    const accessToken = cookieValue(res, 'gc_access');

    const out = await agent.post('/auth/logout').expect(204);
    expect(findCookie(out, 'gc_access')).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(findCookie(out, 'gc_refresh')).toMatch(/Expires=Thu, 01 Jan 1970/);

    // Même en rejouant l'ancien access token encore valide, la session révoquée est refusée.
    await request(app.getHttpServer())
      .get('/protected')
      .set('Cookie', `gc_access=${accessToken}`)
      .expect(401);
    const stored = await sessions.findOneByOrFail({ userId: userOf(res).id });
    expect(stored.revokedAt).toBeInstanceOf(Date);

    // Se déconnecter sans session ne provoque pas d'erreur.
    await request(app.getHttpServer()).post('/auth/logout').expect(204);
  });

  it('déconnecte tous les appareils avec logout-all', async () => {
    const laptop = request.agent(app.getHttpServer());
    const phone = request.agent(app.getHttpServer());
    await register(laptop, 'multi@labo.fr').expect(201);
    await phone
      .post('/auth/login')
      .send({ email: 'multi@labo.fr', password })
      .expect(200);
    await phone.get('/auth/me').expect(200);

    await laptop.post('/auth/logout-all').expect(204);
    await phone.get('/auth/me').expect(401);
    await laptop.get('/auth/me').expect(401);
  });
  describe('réinitialisation du mot de passe', () => {
    const generic =
      'Si un compte existe pour cette adresse, un lien de réinitialisation vient de lui être envoyé.';

    it("répond pareil pour une adresse inconnue, sans envoyer d'e-mail", async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'personne@labo.fr' })
        .expect(202);
      expect((res.body as { message: string }).message).toBe(generic);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(outbox.some((m) => m.to === 'personne@labo.fr')).toBe(false);
    });

    it('change le mot de passe avec le lien reçu et déconnecte tous les appareils', async () => {
      const email = 'oubli@labo.fr';
      const device = request.agent(app.getHttpServer());
      await register(device, email).expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: ' OUBLI@labo.fr ' })
        .expect(202);
      expect((res.body as { message: string }).message).toBe(generic);
      const mail = await waitForMail(email, 1);
      expect(mail.subject).toContain('Réinitialisation');
      const token = tokenFrom(mail);

      // Seule l'empreinte du jeton est stockée, jamais le jeton lui-même.
      const rows = await resetTokens.find();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tokenHash !== token)).toBe(true);

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'nouveau-motdepasse' })
        .expect(204);

      await device.get('/auth/me').expect(401);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'nouveau-motdepasse' })
        .expect(200);

      // E-mail de confirmation, puis lien inutilisable une seconde fois.
      const confirmation = await waitForMail(email, 2);
      expect(confirmation.subject).toContain('a été modifié');
      const reuse = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'encore-un-autre' })
        .expect(400);
      expect(messageOf(reuse)).toContain("n'est pas valide ou a expiré");
    });

    it("n'accepte que le dernier lien demandé", async () => {
      const email = 'deuxliens@labo.fr';
      await register(request.agent(app.getHttpServer()), email).expect(201);
      const ask = () =>
        request(app.getHttpServer())
          .post('/auth/forgot-password')
          .send({ email })
          .expect(202);
      await ask();
      const first = tokenFrom(await waitForMail(email, 1));
      await ask();
      const second = tokenFrom(await waitForMail(email, 2));

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: first, password: 'nouveau-motdepasse' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: second, password: 'nouveau-motdepasse' })
        .expect(204);
    });

    it('refuse un lien expiré, inventé ou mal formé', async () => {
      const email = 'expire@labo.fr';
      await register(request.agent(app.getHttpServer()), email).expect(201);
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email })
        .expect(202);
      const token = tokenFrom(await waitForMail(email, 1));
      await resetTokens.update(
        { usedAt: IsNull() },
        { expiresAt: new Date(Date.now() - 1000) },
      );

      const server = app.getHttpServer();
      await request(server)
        .post('/auth/reset-password')
        .send({ token, password: 'nouveau-motdepasse' })
        .expect(400);
      await request(server)
        .post('/auth/reset-password')
        .send({ token: 'A'.repeat(43), password: 'nouveau-motdepasse' })
        .expect(400);
      await request(server)
        .post('/auth/reset-password')
        .send({ token: 'trop-court', password: 'nouveau-motdepasse' })
        .expect(400);
      await request(server)
        .post('/auth/reset-password')
        .send({ token: 'A'.repeat(43), password: 'court' })
        .expect(400);
    });
  });

  describe('connexion avec Google et GitHub', () => {
    /** Réponses simulées des fournisseurs : aucun appel réseau réel. */
    let googleProfile: Record<string, unknown>;
    let githubUser: Record<string, unknown>;
    let githubEmails: { email: string; primary: boolean; verified: boolean }[];
    let tokenStatus = 200;
    const tokenRequests: { url: string; body: string }[] = [];
    let fetchSpy: jest.SpyInstance;

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    beforeAll(() => {
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          (input: string | URL | Request, init?: RequestInit) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
            if (
              url.includes('oauth2.googleapis.com/token') ||
              url.includes('github.com/login/oauth/access_token')
            ) {
              tokenRequests.push({
                url,
                body:
                  init?.body instanceof URLSearchParams
                    ? init.body.toString()
                    : typeof init?.body === 'string'
                      ? init.body
                      : '',
              });
              return Promise.resolve(
                json({ access_token: 'provider-token' }, tokenStatus),
              );
            }
            if (url.includes('openidconnect.googleapis.com'))
              return Promise.resolve(json(googleProfile));
            if (url.endsWith('api.github.com/user'))
              return Promise.resolve(json(githubUser));
            if (url.endsWith('api.github.com/user/emails'))
              return Promise.resolve(json(githubEmails));
            return Promise.reject(new Error(`appel inattendu : ${url}`));
          },
        );
    });

    afterAll(() => fetchSpy.mockRestore());

    beforeEach(() => {
      tokenStatus = 200;
      tokenRequests.length = 0;
    });

    /** Démarre le parcours : renvoie l'URL du fournisseur, le state et le cookie signé. */
    async function start(provider: 'google' | 'github', remember = false) {
      const res = await request(app.getHttpServer())
        .get(`/auth/oauth/${provider}${remember ? '?remember=1' : ''}`)
        .expect(302);
      const location = new URL(res.headers.location);
      return {
        location,
        state: location.searchParams.get('state') ?? '',
        cookie: cookieValue(res, 'gc_oauth'),
        setCookie: findCookie(res, 'gc_oauth') ?? '',
      };
    }

    function callback(
      provider: string,
      query: Record<string, string>,
      cookie?: string,
    ) {
      const req = request(app.getHttpServer()).get(
        `/auth/oauth/${provider}/callback?${new URLSearchParams(query).toString()}`,
      );
      return cookie ? req.set('Cookie', `gc_oauth=${cookie}`) : req;
    }

    const errorOf = (res: request.Response) =>
      new URL(res.headers.location).searchParams.get('oauth_error');

    const meWith = (res: request.Response) =>
      request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `gc_access=${cookieValue(res, 'gc_access')}`)
        .expect(200);

    it('liste les fournisseurs configurés', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/oauth/providers')
        .expect(200);
      expect(res.body).toEqual({ providers: ['google', 'github'] });
    });

    it('crée un compte avec Google, avec state et PKCE, puis ouvre une session', async () => {
      googleProfile = {
        sub: 'g-123',
        email: 'Chercheuse@Gmail.com',
        email_verified: true,
        name: 'Marie Curie',
      };
      const flow = await start('google', true);

      expect(flow.location.origin + flow.location.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(flow.location.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/auth/oauth/google/callback',
      );
      expect(flow.location.searchParams.get('code_challenge_method')).toBe(
        'S256',
      );
      expect(flow.setCookie).toMatch(/HttpOnly/);
      expect(flow.setCookie).toMatch(/Path=\/auth\/oauth/);

      const res = await callback(
        'google',
        { code: 'code-1', state: flow.state },
        flow.cookie,
      ).expect(302);
      expect(res.headers.location).toBe('http://localhost:3001/login');
      expect(findCookie(res, 'gc_oauth')).toMatch(/Expires=Thu, 01 Jan 1970/);
      // « Se souvenir de moi » transmis jusqu'à la session.
      expect(findCookie(res, 'gc_refresh')).toMatch(/Expires=/);

      // PKCE : le vérificateur envoyé à Google correspond au challenge de départ.
      const verifier =
        new URLSearchParams(tokenRequests[0].body).get('code_verifier') ?? '';
      expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
        flow.location.searchParams.get('code_challenge'),
      );

      const me = await meWith(res);
      expect(userOf(me).email).toBe('chercheuse@gmail.com');
      expect(userOf(me).name).toBe('Marie Curie');

      // Deuxième connexion avec la même identité : même compte, pas de doublon.
      const again = await start('google');
      const res2 = await callback(
        'google',
        { code: 'code-2', state: again.state },
        again.cookie,
      ).expect(302);
      expect(userOf(await meWith(res2)).id).toBe(userOf(me).id);

      // Ce compte n'a pas de mot de passe : la connexion par mot de passe échoue proprement.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'chercheuse@gmail.com', password: 'nimporte-quoi' })
        .expect(401);
    });

    it('rattache GitHub au compte existant qui a la même adresse vérifiée', async () => {
      const agent = request.agent(app.getHttpServer());
      const created = await register(agent, 'dev@labo.fr').expect(201);
      githubUser = { id: 4242, login: 'dev-labo', name: null };
      githubEmails = [
        { email: 'autre@exemple.org', primary: false, verified: false },
        { email: 'dev@labo.fr', primary: true, verified: true },
      ];
      const flow = await start('github');
      expect(flow.location.host).toBe('github.com');
      const res = await callback(
        'github',
        { code: 'gh-code', state: flow.state },
        flow.cookie,
      ).expect(302);
      expect(res.headers.location).toBe('http://localhost:3001/login');
      expect(userOf(await meWith(res)).id).toBe(userOf(created).id);

      // Le mot de passe d'origine reste utilisable.
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'dev@labo.fr', password })
        .expect(200);
    });

    it('refuse un retour sans state valide (protection CSRF)', async () => {
      const flow = await start('google');
      const forged = await callback(
        'google',
        { code: 'c', state: 'state-falsifie' },
        flow.cookie,
      ).expect(302);
      expect(errorOf(forged)).toBe('state');
      expect(findCookie(forged, 'gc_access')).toBeUndefined();

      const noCookie = await callback('google', {
        code: 'c',
        state: flow.state,
      }).expect(302);
      expect(errorOf(noCookie)).toBe('state');

      // Un state émis pour GitHub ne vaut pas pour Google.
      const gh = await start('github');
      const crossed = await callback(
        'google',
        { code: 'c', state: gh.state },
        gh.cookie,
      ).expect(302);
      expect(errorOf(crossed)).toBe('state');
      expect(tokenRequests).toHaveLength(0);
    });

    it('signale un refus, une adresse non vérifiée ou une panne du fournisseur', async () => {
      const cancelled = await start('google');
      const res1 = await callback(
        'google',
        { error: 'access_denied', state: cancelled.state },
        cancelled.cookie,
      );
      expect(errorOf(res1)).toBe('cancelled');

      googleProfile = {
        sub: 'g-unverified',
        email: 'pas-verifiee@gmail.com',
        email_verified: false,
        name: 'Y',
      };
      const unverified = await start('google');
      const res2 = await callback(
        'google',
        { code: 'c', state: unverified.state },
        unverified.cookie,
      );
      expect(errorOf(res2)).toBe('email');

      githubUser = { id: 777, login: 'sans-email', name: 'Z' };
      githubEmails = [
        { email: 'z@exemple.org', primary: true, verified: false },
      ];
      const ghFlow = await start('github');
      const res3 = await callback(
        'github',
        { code: 'c', state: ghFlow.state },
        ghFlow.cookie,
      );
      expect(errorOf(res3)).toBe('email');

      tokenStatus = 500;
      const broken = await start('google');
      const res4 = await callback(
        'google',
        { code: 'c', state: broken.state },
        broken.cookie,
      );
      expect(errorOf(res4)).toBe('provider');
    });

    it('répond 404 pour un fournisseur inconnu', async () => {
      await request(app.getHttpServer())
        .get('/auth/oauth/facebook')
        .expect(404);
    });
  });
});
