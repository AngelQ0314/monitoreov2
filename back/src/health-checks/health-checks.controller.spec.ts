import { Test, TestingModule } from '@nestjs/testing';
import { HealthChecksController } from './health-checks.controller';

describe('HealthChecksController', () => {
  let controller: HealthChecksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthChecksController],
    }).compile();

    controller = module.get<HealthChecksController>(HealthChecksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
