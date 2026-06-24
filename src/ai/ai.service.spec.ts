import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { RagService } from './rag.service';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: RagService, useValue: { retrieve: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
