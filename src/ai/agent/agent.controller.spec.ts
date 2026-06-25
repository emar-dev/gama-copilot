import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

describe('AgentController', () => {
  let controller: AgentController;
  const run = jest.fn();

  beforeEach(async () => {
    run.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [{ provide: AgentService, useValue: { run } }],
    }).compile();
    controller = module.get<AgentController>(AgentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /agent délègue à AgentService.run', async () => {
    run.mockResolvedValue({ answer: 'ok', steps: [] });
    const res = await controller.runPost({ message: 'test' });
    expect(run).toHaveBeenCalledWith('test');
    expect(res.answer).toBe('ok');
  });

  it('GET /agent?q= délègue à AgentService.run', async () => {
    run.mockResolvedValue({ answer: 'doc', steps: [{ tool: 'search_docs', content: '{}' }] });
    await controller.runGet('question GAML');
    expect(run).toHaveBeenCalledWith('question GAML');
  });
});
