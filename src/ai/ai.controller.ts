import { Controller, Get, Query } from '@nestjs/common';
import { AiService } from './ai.service';
import { GamlService } from './gaml.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly gamlService: GamlService,
  ) {}

  @Get()
  ask(@Query('q') q: string) {
    return this.aiService.ask(q);
  }

  @Get('pdf')
  getPDFText(@Query('path') path: string, @Query('query') query?: string) {
    return this.aiService.getPDFText(path, query);
  }

  @Get('chat')
  chat(@Query('q') q: string) {
    return this.aiService.chat(q);
  }

  @Get('generate')
  generate(@Query('q') q: string) {
    return this.gamlService.generate(q);
  }
}
