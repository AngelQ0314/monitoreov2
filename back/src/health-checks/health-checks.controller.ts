import { Controller, Get, Query, Param } from '@nestjs/common';
import { HealthChecksService } from './health-checks.service';

@Controller('health-checks')
export class HealthChecksController {
  constructor(private readonly service: HealthChecksService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get('service/:serviceId')
  findByService(@Param('serviceId') serviceId: string) {
    return this.service.findByService(serviceId);
  }
}
