import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ProjectService } from './project.service';

interface CreateProjectDto {
  name: string;
  description: string;
}

interface WriteFileDto {
  path: string;
  content: string;
}

@Controller('project')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  create(@Body() body: CreateProjectDto) {
    return this.projectService.createProject(body?.name, body?.description);
  }

  @Post('structure')
  structure(@Body() body: { name: string }) {
    return this.projectService.createStructure(body?.name);
  }

  @Post('file')
  writeFile(@Body() body: WriteFileDto) {
    return this.projectService.writeFile(body?.path, body?.content);
  }

  @Post('file/update')
  updateFile(@Body() body: WriteFileDto) {
    return this.projectService.updateFile(body?.path, body?.content);
  }

  @Get('file')
  readFile(@Query('path') path: string) {
    return this.projectService.readFile(path);
  }
}
