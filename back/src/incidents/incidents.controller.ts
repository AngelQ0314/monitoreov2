import { Controller, Get, Query, Param, Post, Body, Patch, Delete } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { AddIncidentUpdateDto } from './dto/add-incident-update.dto';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  create(@Body() dto: CreateIncidentDto) {
    return this.incidentsService.create(dto);
  }

  @Patch(':id/estado')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentStatusDto,
  ) {
    return this.incidentsService.updateStatus(id, dto);
  }

  @Post(':id/actualizaciones')
  addUpdate(
    @Param('id') id: string,
    @Body() dto: AddIncidentUpdateDto,
  ) {
    return this.incidentsService.addUpdate(id, dto);
  }


  @Get('service/:serviceId')
  getByService(@Param('serviceId') serviceId: string) {
    return this.incidentsService.findByService(serviceId);
  }

    @Get()
  getAll(@Query() query: any) {
    return this.incidentsService.findAll(query);
  }

    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.incidentsService.remove(id);
    }
}
