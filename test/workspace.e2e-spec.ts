/**
 * Conversations, projets et isolation des espaces de travail (e2e, base MySQL dédiée).
 * L'agent est remplacé par un double qui passe par le vrai ProjectService : on vérifie
 * ainsi que ce qu'il écrit atterrit bien dans l'espace de l'utilisateur qui a fait la demande.
 */
import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AgentService, type AgentTurn } from '../src/ai/agent/agent.service';
import { GamlService } from '../src/ai/gaml.service';
import { configureApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import { WorkspaceInterceptor } from '../src/auth/workspace.interceptor';
import { AssistantController } from '../src/chat/assistant.controller';
import { ChatController } from '../src/chat/chat.controller';
import { ChatService } from '../src/chat/chat.service';
import { ChatMessage, Conversation } from '../src/chat/conversation.entity';
import { validateEnv } from '../src/config/env.validation';
import { buildDataSourceOptions } from '../src/database/typeorm.config';
import { ProjectController } from '../src/project/project.controller';
import { ProjectService } from '../src/project/project.service';
import { ProjectsController } from '../src/project/projects.controller';

const TEST_DB = `${process.env.DB_NAME}_test_workspace`;

const HOSPITAL = `model Hopital
global {
  int nb_patients <- 120;
  init { create patient number: nb_patients; create doctor number: 24; }
}
species patient skills: [moving] { bool waiting <- true; reflex move { do wander; } }
species doctor { reflex treat { } }
experiment main type: gui { output { display carte { species patient; } } }
`;

interface Body {
  conversation: { id: string; title: string };
  messages: {
    role: string;
    content: string;
    status: string;
    projects: string[];
  }[];
}

describe('Conversations et espaces de travail (e2e)', () => {
  let app: INestApplication<App>;
  let workspaceDir: string;
  let projects: ProjectService;
  const histories: AgentTurn[][] = [];

  /** Double de l'agent : crée un projet à la demande, ou échoue si on parle de « panne ». */
  const fakeAgent = {
    run: async (message: string, history: AgentTurn[] = []) => {
      histories.push(history);
      if (message.includes('panne')) throw new Error('Ollama injoignable');
      if (message.includes('hôpital')) {
        await projects.createStructure('Hopital');
        await projects.writeFile('Hopital/models/Hopital.gaml', HOSPITAL);
        return {
          answer: 'Le modèle Hopital est prêt.',
          steps: [
            {
              tool: 'write_file',
              content: JSON.stringify({
                path: 'Hopital/models/Hopital.gaml',
                written: true,
              }),
            },
          ],
        };
      }
      return { answer: `Réponse à : ${message}`, steps: [] };
    },
  };

  beforeAll(async () => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'gama-ws-'));
    process.env.WORKSPACE_DIR = workspaceDir;
    process.env.GAMA_HEADLESS = join(workspaceDir, 'absent.bat'); // pas de GAMA : validation heuristique
    process.env.BCRYPT_ROUNDS = '4';
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    process.env.COOKIE_SECURE = 'false';

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
        TypeOrmModule.forFeature([Conversation, ChatMessage]),
        AuthModule,
      ],
      controllers: [
        ChatController,
        ProjectsController,
        ProjectController,
        AssistantController,
      ],
      providers: [
        ChatService,
        ProjectService,
        { provide: AgentService, useValue: fakeAgent },
        { provide: GamlService, useValue: {} },
        { provide: APP_INTERCEPTOR, useClass: WorkspaceInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    projects = moduleRef.get(ProjectService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  async function signUp(email: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/auth/register')
      .send({ name: 'Chercheur', email, password: 'motdepasse-solide' })
      .expect(201);
    return { agent, id: (res.body as { user: { id: string } }).user.id };
  }

  it('refuse les routes sans connexion', async () => {
    const server = app.getHttpServer();
    await request(server).get('/conversations').expect(401);
    await request(server).get('/projects').expect(401);
    await request(server)
      .post('/conversations')
      .send({ message: 'x' })
      .expect(401);
  });

  it("enregistre la conversation et range le projet de l'agent dans l'espace de son utilisateur", async () => {
    const alice = await signUp('alice@labo.fr');
    const bob = await signUp('bob@labo.fr');

    const first = await alice.agent
      .post('/conversations')
      .send({
        message: '  Crée un modèle d’hôpital avec patients et médecins  ',
      })
      .expect(201);
    const body = first.body as Body;
    expect(body.conversation.title).toBe(
      'Crée un modèle d’hôpital avec patients et médecins',
    );
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(body.messages[1]).toMatchObject({
      content: 'Le modèle Hopital est prêt.',
      status: 'ok',
      projects: ['Hopital'],
    });

    // Sur le disque : dans workspace/users/<id d'Alice>, nulle part ailleurs.
    expect(
      existsSync(
        join(workspaceDir, 'users', alice.id, 'Hopital/models/Hopital.gaml'),
      ),
    ).toBe(true);
    expect(existsSync(join(workspaceDir, 'Hopital'))).toBe(false);

    const list = await alice.agent.get('/projects').expect(200);
    expect(list.body).toMatchObject({
      projects: [{ name: 'Hopital', mainModel: 'Hopital/models/Hopital.gaml' }],
    });
    await bob.agent.get('/projects').expect(200, { projects: [] });
    await bob.agent
      .get('/project/file?path=Hopital/models/Hopital.gaml')
      .expect(404);
    await bob.agent
      .get(`/project/file?path=../${alice.id}/Hopital/models/Hopital.gaml`)
      .expect(400);

    // Bob ne voit pas non plus la conversation d'Alice.
    await bob.agent.get(`/conversations/${body.conversation.id}`).expect(404);
    await bob.agent.get('/conversations').expect(200, { conversations: [] });

    // Suite de la conversation : l'agent reçoit l'échange précédent comme contexte.
    histories.length = 0;
    await alice.agent
      .post(`/conversations/${body.conversation.id}/messages`)
      .send({ message: 'Ajoute des infirmiers' })
      .expect(200);
    expect(histories[0]).toEqual([
      {
        role: 'user',
        content: 'Crée un modèle d’hôpital avec patients et médecins',
      },
      { role: 'assistant', content: 'Le modèle Hopital est prêt.' },
    ]);

    const full = await alice.agent
      .get(`/conversations/${body.conversation.id}`)
      .expect(200);
    expect((full.body as Body).messages).toHaveLength(4);
  });

  it('résume et valide le modèle du projet', async () => {
    const carol = await signUp('carol@labo.fr');
    await carol.agent
      .post('/conversations')
      .send({ message: 'Un hôpital, vite' })
      .expect(201);

    const files = await carol.agent.get('/projects/Hopital/files').expect(200);
    expect(
      (files.body as { files: { path: string }[] }).files.map((f) => f.path),
    ).toEqual(['Hopital/models/Hopital.gaml']);

    const summary = await carol.agent
      .get('/projects/Hopital/summary')
      .expect(200);
    const s = (
      summary.body as {
        summary: {
          species: { name: string; initialCount: number }[];
          experiments: { name: string }[];
        };
      }
    ).summary;
    expect(s.species).toMatchObject([
      { name: 'patient', initialCount: 120 },
      { name: 'doctor', initialCount: 24 },
    ]);
    expect(s.experiments.map((e) => e.name)).toEqual(['main']);

    const validation = await carol.agent
      .post('/projects/Hopital/validate')
      .send({})
      .expect(200);
    expect(validation.body).toMatchObject({
      file: 'Hopital/models/Hopital.gaml',
      validatedBy: 'heuristic',
      valid: true,
    });

    await carol.agent.get('/projects/Inexistant/summary').expect(404);
    await carol.agent.get('/projects/..%2F..%2Fetc/files').expect(400);
  });

  it("garde la demande et signale l'échec quand l'agent ne répond pas", async () => {
    const dave = await signUp('dave@labo.fr');
    const res = await dave.agent
      .post('/conversations')
      .send({ message: 'Simule une panne' })
      .expect(201);
    const body = res.body as Body;
    expect(body.messages[1].status).toBe('error');
    expect(body.messages[1].content).toContain('Ollama injoignable');

    // La réponse en erreur n'est pas renvoyée à l'agent comme contexte.
    histories.length = 0;
    await dave.agent
      .post(`/conversations/${body.conversation.id}/messages`)
      .send({ message: 'Et maintenant ?' })
      .expect(200);
    expect(histories[0]).toEqual([
      { role: 'user', content: 'Simule une panne' },
    ]);
  });

  it('renomme, liste et supprime les conversations ; valide les entrées', async () => {
    const erin = await signUp('erin@labo.fr');
    const a = await erin.agent
      .post('/conversations')
      .send({ message: 'Première' })
      .expect(201);
    const b = await erin.agent
      .post('/conversations')
      .send({ message: 'Seconde' })
      .expect(201);
    const idA = (a.body as Body).conversation.id;
    const idB = (b.body as Body).conversation.id;

    const list = await erin.agent.get('/conversations').expect(200);
    expect(
      (list.body as { conversations: { id: string }[] }).conversations.map(
        (c) => c.id,
      ),
    ).toEqual([idB, idA]);

    await erin.agent
      .patch(`/conversations/${idA}`)
      .send({ title: 'Épidémie campus' })
      .expect(200);
    await erin.agent.delete(`/conversations/${idB}`).expect(204);
    await erin.agent.get(`/conversations/${idB}`).expect(404);

    await erin.agent
      .post('/conversations')
      .send({ message: '   ' })
      .expect(400);
    await erin.agent
      .post('/conversations')
      .send({ message: 'x'.repeat(4001) })
      .expect(400);
    await erin.agent.get('/conversations/pas-un-uuid').expect(400);
  });

  it("indique l'état d'Ollama et de GAMA", async () => {
    const frank = await signUp('frank@labo.fr');
    const res = await frank.agent.get('/assistant/status').expect(200);
    expect(res.body).toMatchObject({
      llm: {
        reachable: expect.any(Boolean) as boolean,
        model: expect.any(String) as string,
      },
      gama: { installed: false },
    });
  });
});
