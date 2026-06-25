import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { AgentService } from './agent.service';
import { RagService } from '../rag.service';
import { ProjectService } from '../../project/project.service';

const mockInvoke = jest.fn();

jest.mock('./agent.utils', () => ({
  ...jest.requireActual('./agent.utils'),
  createCopilotAgent: jest.fn(() => ({ invoke: mockInvoke })),
}));

describe('AgentService', () => {
  let service: AgentService;

  beforeEach(async () => {
    mockInvoke.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: RagService, useValue: { retrieveContext: jest.fn() } },
        { provide: ProjectService, useValue: { readFile: jest.fn(), writeFile: jest.fn() } },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rejette un message vide', async () => {
    await expect(service.run('')).rejects.toThrow(BadRequestException);
  });

  it('retourne answer et steps depuis l\'agent', async () => {
    mockInvoke.mockResolvedValue({
      messages: [
        new HumanMessage('test'),
        new ToolMessage({ content: '{"found":1}', name: 'search_docs', tool_call_id: '1' }),
        new AIMessage('Voici la réponse.'),
      ],
    });

    const res = await service.run('Ajoute des voitures bleues sur une route avec create_project');
    expect(res.answer).toBe('Voici la réponse.');
    expect(res.steps).toHaveLength(1);
    expect(res.steps[0].tool).toBe('search_docs');
  });
});
