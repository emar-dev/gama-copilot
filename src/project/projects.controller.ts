import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ProjectService } from './project.service';

/**
 * Projets de l'utilisateur connecté (son espace de travail personnel,
 * fixé par WorkspaceInterceptor). Lecture d'un fichier : GET /project/file?path=…
 */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectService) {}

  @Get()
  async list() {
    return { projects: await this.projects.listProjects() };
  }

  @Get(':name/files')
  async files(@Param('name') name: string) {
    return { files: await this.projects.listFiles(name) };
  }

  @Get(':name/summary')
  summary(@Param('name') name: string, @Query('file') file?: string) {
    return this.projects.summary(name, file);
  }

  @Post(':name/validate')
  @HttpCode(200)
  validate(@Param('name') name: string, @Body() body: { file?: string }) {
    return this.projects.validate(name, body?.file);
  }
}
