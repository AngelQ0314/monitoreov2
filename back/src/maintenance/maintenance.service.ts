import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { Maintenance } from './schemas/maintenance.schema';
import { ServicesService } from '../services/services.service';
import { HealthChecksService } from '../health-checks/health-checks.service';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectModel(Maintenance.name)
    private maintenanceModel: Model<Maintenance>,
    @Inject(forwardRef(() => ServicesService))
    private servicesService: ServicesService,
    @Inject(forwardRef(() => HealthChecksService))
    private healthChecksService: HealthChecksService,
  ) {}

async findWithFilters(query: any) {
  const filters: any = {};

  if (query.serviceId) {
    filters.serviceId = query.serviceId;
  }

  if (query.estado) {
    filters.estado = query.estado;
  }

  if (query.cadena) {
    filters.cadena = query.cadena;
  }

  if (query.restaurante) {
    filters.restaurante = query.restaurante;
  }

  return this.maintenanceModel.find(filters).exec();
}


  async findByService(serviceId: string) {
    return this.maintenanceModel.find({ serviceId }).exec();
  }

  async create(dto: CreateMaintenanceDto) {
    // Validaciones mínimas: serviceId existe
    if (!dto || !dto.serviceId) throw new BadRequestException('serviceId is required');

    // Validar que no exista un mantenimiento con el mismo título
    if (dto.titulo) {
      const existing = await this.maintenanceModel.findOne({ 
        titulo: dto.titulo,
        activo: { $ne: false } // Solo considerar mantenimientos activos
      }).exec();
      
      if (existing) {
        throw new BadRequestException(`Ya existe un mantenimiento con el título "${dto.titulo}"`);
      }
    }

    // Comprobar que el servicio existe
    let svc: any = null;
    try {
      const found = await this.servicesService.findAll({ id: dto.serviceId });
      svc = Array.isArray(found) ? found[0] : found;
    } catch (err) {
      // fallthrough
    }
    if (!svc) throw new NotFoundException('Servicio no encontrado');

    // Validar y normalizar fechas
    if (!dto.fechaInicio) throw new BadRequestException('fechaInicio is required');
    const inicio = new Date(dto.fechaInicio);
    if (Number.isNaN(inicio.getTime())) throw new BadRequestException('fechaInicio invalid');
    let fin: Date | null = null;
    if (dto.fechaFin) {
      fin = new Date(dto.fechaFin);
      if (Number.isNaN(fin.getTime())) throw new BadRequestException('fechaFin invalid');
      if (fin <= inicio) throw new BadRequestException('fechaFin must be after fechaInicio');
    }

    const toCreate = {
      ...dto,
      fechaInicio: inicio.toISOString(),
      fechaFin: fin ? fin.toISOString() : undefined,
      fechaCreacion: new Date().toISOString(),
      estado: dto.estado || 'Programado',
      tipo: (dto as any).tipo || 'programado',
      impacto: (dto as any).impacto || 'parcial',
      activo: (dto as any).activo !== undefined ? (dto as any).activo : true,
      modo: (dto as any).modo || 'pause',
      multiplier: (dto as any).multiplier !== undefined ? (dto as any).multiplier : undefined,
    } as any;

    const created = await this.maintenanceModel.create(toCreate);

    // Marcar servicio en modo mantenimiento y desactivar scheduler
    try {
      if (this.servicesService) await this.servicesService.update(dto.serviceId, { maintenanceMode: true });
      if (this.healthChecksService) await this.healthChecksService.unregisterServiceScheduler(dto.serviceId);
    } catch (err) {
      console.warn('No se pudo activar maintenanceMode para el servicio:', err?.message || err);
    }

    return created;
  }

  async update(id: string, dto: UpdateMaintenanceDto) {
    // Normalize dates if provided
    const setObj: any = { ...dto };
    if (dto.fechaInicio) {
      const d = new Date(dto.fechaInicio as any);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('fechaInicio invalid');
      setObj.fechaInicio = d;
    }
    if (dto.fechaFin) {
      const d2 = new Date(dto.fechaFin as any);
      if (Number.isNaN(d2.getTime())) throw new BadRequestException('fechaFin invalid');
      setObj.fechaFin = d2;
    }
    // validar modo y multiplier si vienen
    if ((dto as any).modo) {
      const allowed = ['pause', 'reduce'];
      if (!allowed.includes((dto as any).modo)) throw new BadRequestException('modo invalid');
      setObj.modo = (dto as any).modo;
    }
    if ((dto as any).multiplier !== undefined) {
      const mval = Number((dto as any).multiplier);
      if (Number.isNaN(mval) || mval <= 0) throw new BadRequestException('multiplier invalid');
      setObj.multiplier = mval;
    }

    const updated = await this.maintenanceModel.findByIdAndUpdate(
      id,
      { $set: setObj },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Mantenimiento no encontrado');
    }

    // Si el mantenimiento terminó (fechaFin o estado final), desactivar maintenanceMode
    try {
      const finished = dto.fechaFin || (dto.estado && dto.estado.toString().toLowerCase() === 'finalizado');
      if (finished && updated.serviceId && this.servicesService) {
        // Desactivar maintenanceMode en el servicio
        // El método update() de services detectará el cambio de maintenanceMode
        // y evitará el check inmediato, dejando que el scheduler lo haga con jitter
        await this.servicesService.update(updated.serviceId, { maintenanceMode: false });
      }
    } catch (err) {
      console.warn('No se pudo actualizar servicio tras finalizar mantenimiento:', err?.message || err);
    }

    return updated;
  }

  async finish(id: string) {
    return this.update(id, { 
      estado: 'Finalizado', 
      fechaFin: new Date().toISOString() 
    });
  }

  async remove(id: string, hard = false) {
    const existing = await this.maintenanceModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Mantenimiento no encontrado');

    if (!hard) {
      // soft-delete: marcar inactivo y, si estaba en curso, desactivar maintenanceMode
      existing.activo = false as any;
      await existing.save();
      try {
        if (existing.serviceId && this.servicesService) {
          // Solo actualizar maintenanceMode, el scheduler existente continuará normalmente
          await this.servicesService.update(existing.serviceId, { maintenanceMode: false });
        }
      } catch (err) {
        console.warn('Error updating service after soft-delete of maintenance:', err?.message || err);
      }
      return existing;
    }

    // hard delete: remove document
    try {
      const removed = await this.maintenanceModel.findByIdAndDelete(id).exec();
      if (removed && removed.serviceId && this.servicesService) {
        try {
          // Solo actualizar maintenanceMode, el scheduler existente continuará normalmente
          await this.servicesService.update(removed.serviceId, { maintenanceMode: false });
        } catch (err) {
          console.warn('Error updating service after hard-delete of maintenance:', err?.message || err);
        }
      }
      return removed;
    } catch (err) {
      throw err;
    }
  }

  async finishAll() {
    // Finalizar todos los mantenimientos activos que no estén ya finalizados
    const maintenances = await this.maintenanceModel.find({ 
      activo: { $ne: false },
      estado: { $ne: 'Finalizado' }
    }).exec();

    const results: any[] = [];
    for (const maintenance of maintenances) {
      try {
        const finished = await this.finish(maintenance._id.toString());
        results.push(finished);
      } catch (err) {
        console.warn(`Error finalizando mantenimiento ${maintenance._id}:`, err?.message || err);
      }
    }

    return { 
      finalizados: results.length,
      total: maintenances.length 
    };
  }

  async removeAll() {
    // Eliminar (soft-delete) todos los mantenimientos activos
    const maintenances = await this.maintenanceModel.find({ 
      activo: { $ne: false }
    }).exec();

    const results: any[] = [];
    for (const maintenance of maintenances) {
      try {
        const removed = await this.remove(maintenance._id.toString(), false);
        results.push(removed);
      } catch (err) {
        console.warn(`Error eliminando mantenimiento ${maintenance._id}:`, err?.message || err);
      }
    }

    return { 
      eliminados: results.length,
      total: maintenances.length 
    };
  }
}
