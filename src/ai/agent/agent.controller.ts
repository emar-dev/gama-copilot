import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { AgentService } from './agent.service';

interface AgentRunDto {
  message: string;
}

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /** J26/J30 : agent autonome (ReAct + tools). */
  @Post()
  runPost(@Body() body: AgentRunDto) {
    return this.agentService.run(body?.message);
  }

  /** Variante GET pour tests rapides (Postman, curl). */
  @Get()
  runGet(@Query('q') q: string) {
    return this.agentService.run(q);
  }
}
