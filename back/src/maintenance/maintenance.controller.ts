import { Controller, Get, Post, Patch, Param, Body, Query, Delete } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

@Get()
findAll(@Query() query: any) {
  return this.service.findWithFilters(query);
}


  @Get('service/:serviceId')
  findByService(@Param('serviceId') serviceId: string) {
    return this.service.findByService(serviceId);
  }

  @Post()
  create(@Body() dto: CreateMaintenanceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('hard') hard?: string) {
    const isHard = hard === 'true' || hard === '1';
    return this.service.remove(id, isHard);
  }
}
