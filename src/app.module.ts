import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiService } from './ai/ai.service';
import { AiController } from './ai/ai.controller';
import { RagService } from './ai/rag.service';
import { GamlService } from './ai/gaml.service';
import { ProjectController } from './project/project.controller';
import { ProjectService } from './project/project.service';
import { AgentController } from './ai/agent/agent.controller';
import { AgentService } from './ai/agent/agent.service';

@Module({
  imports: [],
  controllers: [AppController, AiController, ProjectController, AgentController],
  providers: [AppService, AiService, RagService, GamlService, ProjectService, AgentService],
})
export class AppModule {}
