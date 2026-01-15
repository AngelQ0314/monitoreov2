import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IncidentEntity } from './schemas/incident.schema';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { AddIncidentUpdateDto } from './dto/add-incident-update.dto';
import { ServicesService } from '../services/services.service';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectModel(IncidentEntity.name)
    private readonly incidentModel: Model<IncidentEntity>,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
  ) {}

  async create(dto: CreateIncidentDto) {
    // Validar que no exista un incidente con el mismo título (solo abiertos)
    if (dto.titulo) {
      const existing = await this.incidentModel.findOne({ 
        titulo: dto.titulo,
        estado: { $ne: 'Resuelto' } // Solo considerar incidentes no resueltos
      }).exec();
      
      if (existing) {
        throw new BadRequestException(`Ya existe un incidente abierto con el título "${dto.titulo}"`);
      }
    }

    const created = await this.incidentModel.create({
      ...dto,
      actualizaciones: [],
      fechaResolucion: null,
    });

    // Si el incidente afecta a un servicio, aplicar override/manual mode
    try {
      if (dto.serviceId && this.servicesService) {
        // Activar override manual en el servicio pero NO sobrescribir su `estado`.
        // Dejar que el estado se mantenga y que, al resolver/quitar incidentes, se recalcule desde los checks.
        await this.servicesService.update(dto.serviceId, { manualOverride: true });
      }
    } catch (err) {
      console.warn('No se pudo aplicar manualOverride tras crear incidente:', err?.message || err);
    }

    return created;
  }

  async updateStatus(id: string, dto: UpdateIncidentStatusDto) {
    const incident = await this.incidentModel.findById(id);
    if (!incident) throw new NotFoundException('Incidente no encontrado');

    incident.estado = dto.estado;

    if (dto.estado === 'Resuelto') {
      incident.fechaResolucion =
        dto.fechaResolucion ?? new Date().toISOString();
      // Al resolver, quitar override en el servicio y recalcular estado
      try {
        if (incident.serviceId && this.servicesService) {
          await this.servicesService.update(incident.serviceId, { manualOverride: false });
          if (this.servicesService) await this.servicesService.updateEstadoFromChecks(incident.serviceId);
        }
      } catch (err) {
        console.warn('No se pudo quitar manualOverride tras resolver incidente:', err?.message || err);
      }
    }

    return incident.save();
  }

  async addUpdate(id: string, dto: AddIncidentUpdateDto) {
    const incident = await this.incidentModel.findById(id);
    if (!incident) throw new NotFoundException('Incidente no encontrado');

    incident.actualizaciones.push(dto);
    return incident.save();
  }

  async findAll(filters: any) {
    const query: any = {};

    if (filters.serviceId) {
      query.serviceId = filters.serviceId;
    }

    if (filters.estado) {
      query.estado = filters.estado;
    }

    if (filters.severidad) {
      query.severidad = filters.severidad;
    }

    if (filters.cadena) {
      query.cadena = filters.cadena;
    }

    if (filters.restaurante) {
      query.restaurante = filters.restaurante;
    }

    return this.incidentModel
      .find(query)
      .sort({ fechaInicio: -1 })
      .exec();
  }

  async findByService(serviceId: string) {
    return this.incidentModel
      .find({ serviceId })
      .sort({ fechaInicio: -1 })
      .exec();
  }

  async remove(id: string) {
    const existing = await this.incidentModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Incidente no encontrado');
    const serviceId = existing.serviceId;
    try {
      const removed = await this.incidentModel.findByIdAndDelete(id).exec();

      // If the incident was linked to a service, check if there are any other open incidents.
      if (serviceId && this.incidentModel) {
        try {
          const others = await this.incidentModel.find({ serviceId, estado: { $ne: 'Resuelto' } }).limit(1).exec();
          if (!others || !others.length) {
            // No other open incidents — clear manualOverride and recalculate estado
            if (this.servicesService) {
              try {
                await this.servicesService.update(serviceId, { manualOverride: false });
                if (this.servicesService) await this.servicesService.updateEstadoFromChecks(serviceId);
              } catch (err) {
                console.warn('No se pudo limpiar manualOverride tras eliminar incidente:', err?.message || err);
              }
            }
          }
        } catch (err) {
          console.warn('Error comprobando otros incidentes tras eliminar:', err?.message || err);
        }
      }

      return removed;
    } catch (err) {
      throw err;
    }
  }
}
