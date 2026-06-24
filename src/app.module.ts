import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiService } from './ai/ai.service';
import { AiController } from './ai/ai.controller';
import { RagService } from './ai/rag.service';
import { GamlService } from './ai/gaml.service';

@Module({
  imports: [],
  controllers: [AppController, AiController],
  providers: [AppService, AiService, RagService, GamlService],
})
export class AppModule {}
