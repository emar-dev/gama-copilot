import { Body, Controller, Get, } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
    constructor(private readonly aiService: AiService) {

    }
    @Get()
    async ask(@Body('q') q: string) {
        return this.aiService.ask(q);
    }
    @Get('pdf')
    async getPDFText(@Body('path') path: string) {
        return this.aiService.getPDFText(path);
    }
}
