import { Controller, Get, Query, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  create(@Body() dto: any) {
    return this.servicesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('hard') hard?: string) {
    const isHard = hard === 'true' || hard === '1';
    return this.servicesService.remove(id, isHard);
  }

  @Delete('deleted/all')
  removeAllDeleted() {
    return this.servicesService.removeAllDeleted();
  }
  
  @Patch(':id/resync')
  async resyncService(@Param('id') id: string, @Query('limit') limit?: string) {
    const lim = limit ? Number(limit) : 5;
    const service = await this.servicesService.updateEstadoFromChecks(id, lim);
    const checks = await this.servicesService.getRecentChecksForService(id, lim);
    return { service, checks };
  }

  @Patch(':id/check')
  async runCheck(@Param('id') id: string, @Query('limit') limit?: string) {
    const lim = limit ? Number(limit) : 1;
    const checks = await this.servicesService.runImmediateCheck(id, lim);
    return { checks };
  }
  
  @Get('resumen')
  getResumen() {
    return this.servicesService.resumen();
  }

  @Get('filtrar-fecha')
  async filtrarPorFecha(@Query() query: any) {
    const filters = { ...query, tipoFiltro: 'fecha' };
    return this.servicesService.findAll(filters);
  }

  @Get()
  async getServices(@Query() query: any) {
    return this.servicesService.findAll(query);
  }

  @Get('deleted')
  async getDeletedServices() {
    // Return services explicitly marked as inactive (soft-deleted)
    return this.servicesService.findAll({ activo: 'false' });
  }

  @Get('estados')
  async getEstados() {
    return this.servicesService.getUniqueEstados();
  }

  @Get('cadenas')
  async getCadenas() {
    return this.servicesService.getUniqueCadenas();
  }

  @Get('restaurantes')
  async getRestaurantes() {
    return this.servicesService.getUniqueRestaurantes();
  }

  
}