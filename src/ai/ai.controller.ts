import { Controller, Get, Query } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

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
}
