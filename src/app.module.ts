import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiService } from './ai/ai.service';
import { AiController } from './ai/ai.controller';
import { RagService } from './ai/rag.service';
import { GamlService } from './ai/gaml.service';
import { AuthModule } from './auth/auth.module';
import { WorkspaceInterceptor } from './auth/workspace.interceptor';
import { AssistantController } from './chat/assistant.controller';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { ChatMessage, Conversation } from './chat/conversation.entity';
import { validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.config';
import { ProjectController } from './project/project.controller';
import { ProjectService } from './project/project.service';
import { ProjectsController } from './project/projects.controller';
import { AgentController } from './ai/agent/agent.controller';
import { AgentService } from './ai/agent/agent.service';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions(process.env),
        // Applique les migrations en attente au démarrage (désactivable avec DB_MIGRATIONS_RUN=false).
        migrationsRun: config.get('DB_MIGRATIONS_RUN') !== 'false',
      }),
    }),
    TypeOrmModule.forFeature([Conversation, ChatMessage]),
    UsersModule,
    AuthModule,
  ],
  controllers: [
    AppController,
    AiController,
    ProjectController,
    ProjectsController,
    AgentController,
    ChatController,
    AssistantController,
  ],
  providers: [
    AppService,
    AiService,
    RagService,
    GamlService,
    ProjectService,
    AgentService,
    ChatService,
    // Chaque requête authentifiée travaille dans l'espace de projets de son utilisateur.
    { provide: APP_INTERCEPTOR, useClass: WorkspaceInterceptor },
  ],
})
export class AppModule {}
