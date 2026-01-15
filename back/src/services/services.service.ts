import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { HealthChecksService } from '../health-checks/health-checks.service';
import { customAlphabet } from 'nanoid';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ServiceEntity } from './schemas/service.schema';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);
  constructor(
    @InjectModel(ServiceEntity.name)
    private readonly serviceModel: Model<ServiceEntity>,
    @Inject(forwardRef(() => HealthChecksService))
    private readonly healthChecksService?: HealthChecksService,
  ) {}

  async getUniqueEstados() {
    return this.serviceModel.distinct('estado');
  }

  async getUniqueCadenas() {
    return this.serviceModel.distinct('clasificacion.cadena');
  }

  async getUniqueRestaurantes() {
    return this.serviceModel.distinct('clasificacion.restaurante');
  }

  async findAll(filters: any) {
    const query: any = {};

    if (filters.id) {
      query._id = filters.id;
    }

    if (filters.estado) {
      query.estado = filters.estado;
    }

    if (filters.tipo) {
      query.tipo = filters.tipo;
    }

    if (filters.ambiente) {
      query.ambiente = filters.ambiente;
    }

    if (filters.activo !== undefined) {
      query.activo = filters.activo === 'true';
    }

    if (filters.cadena) {
      query['clasificacion.cadena'] = filters.cadena;
    }

    if (filters.restaurante) {
      query['clasificacion.restaurante'] = filters.restaurante;
    }

    if (filters.importancia) {
      query.importancia = filters.importancia;
    }

    if (filters.desde || filters.hasta) {
      const campoFecha =
        filters.campoFecha === 'fechaCreacion'
          ? 'fechaCreacion'
          : 'fechaActualizacion';

      query[campoFecha] = {};

      if (filters.desde) {
        query[campoFecha].$gte = `${filters.desde}T00:00:00Z`;
      }

      if (filters.hasta) {
        query[campoFecha].$lte = `${filters.hasta}T23:59:59Z`;
      }
    }

    console.log('Query construida:', JSON.stringify(query, null, 2));

    const results = await this.serviceModel
      .find(query)
      .sort({ fechaActualizacion: -1 })
      .exec();

    console.log(`Resultados encontrados: ${results.length}`);

    return results;
  }

  async resumen() {
    const pipeline = [
      { $match: { activo: true } },
      {
        $group: {
          _id: '$estado',
          total: { $sum: 1 },
        },
      },
    ];

    const result = await this.serviceModel.aggregate(pipeline);

    const resumen = {
      operando: 0,
      impactado: 0,
      degradado: 0,
      interrumpido: 0,
    };

    result.forEach((item) => {
      switch (item._id) {
        case 'Operando normalmente':
          resumen.operando = item.total;
          break;
        case 'Impactado':
          resumen.impactado = item.total;
          break;
        case 'Degradado':
          resumen.degradado = item.total;
          break;
        case 'Interrumpido':
          resumen.interrumpido = item.total;
          break;
      }
    });

    return resumen;
  }

  async create(dto: any) {
    // Rellenar valores por defecto para endpoint si no se proporcionan
    dto.endpoint = dto.endpoint || {};
    dto.endpoint.metodo = dto.endpoint.metodo || dto.endpoint.method || 'GET';
    const defaultExpectedCode = process.env.HEALTH_CHECK_EXPECTED_CODE_DEFAULT
      ? Number(process.env.HEALTH_CHECK_EXPECTED_CODE_DEFAULT)
      : 200;
    dto.endpoint.codigoEsperado = dto.endpoint.codigoEsperado ?? defaultExpectedCode;
    dto.endpoint.timeoutMs = dto.endpoint.timeoutMs ?? (process.env.HEALTH_CHECK_TIMEOUT_MS ? Number(process.env.HEALTH_CHECK_TIMEOUT_MS) : 10000);

    const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);
    const now = new Date().toISOString();
    const created = await this.serviceModel.create({
      ...dto,
      _id: dto._id || `srv-${nanoid()}`,
      fechaCreacion: now,
      fechaActualizacion: now,
    });

    // Ejecutar health check inmediato si el servicio fue creado
    const runImmediate = process.env.HEALTH_CHECK_RUN_IMMEDIATE_ON_CREATE !== 'false';
    if (runImmediate && this.healthChecksService) {
      // Asegurar que trabajamos con un documento (no un array inesperado)
      const createdDoc: any = Array.isArray(created) ? created[0] : created;
      try {
        // Pasar skipEscalation=true para no escalar importancia en el primer check
        await this.healthChecksService.runCheckForService(createdDoc, true);
      } catch (err) {
        console.warn('No se pudo ejecutar health check inmediato:', err?.message || err);
      }

      // Forzar recálculo del estado y devolver el servicio actualizado
      try {
        const createdId = createdDoc?._id || (createdDoc && createdDoc.id) || undefined;
        if (createdId) {
          const updated = await this.updateEstadoFromChecks(createdId as string);
          // Registrar scheduler para este servicio
          try {
            if (this.healthChecksService && this.healthChecksService.registerServiceScheduler) await this.healthChecksService.registerServiceScheduler(createdDoc);
          } catch (err) {
            console.warn('No se pudo registrar scheduler para servicio creado:', err?.message || err);
          }
          return updated || createdDoc;
        }
        return createdDoc;
      } catch (err) {
        console.warn('Error al recalcular estado tras check inmediato:', err?.message || err);
        return createdDoc;
      }
    }
    // Registrar scheduler aunque no se haya ejecutado el check inmediato
    try {
      if (this.healthChecksService && this.healthChecksService.registerServiceScheduler) await this.healthChecksService.registerServiceScheduler(created);
    } catch (err) {
      console.warn('No se pudo registrar scheduler para servicio creado:', err?.message || err);
    }
    return created;
  }

  async update(id: string, dto: any) {
    // Obtener servicio actual para detectar cambios
    const currentService = await this.serviceModel.findById(id).exec();
    const isBeingRestored = currentService && !currentService.activo && dto.activo === true;
    const isLeavingMaintenance = currentService && currentService.maintenanceMode && dto.maintenanceMode === false;
    const isEnteringMaintenance = currentService && !currentService.maintenanceMode && dto.maintenanceMode === true;
    
    // Detectar si solo se está cambiando manualOverride (sin otros campos significativos)
    const dtoKeys = Object.keys(dto).filter(k => k !== 'fechaActualizacion');
    const isOnlyManualOverrideChange = dtoKeys.length === 1 && dtoKeys[0] === 'manualOverride';
    const isOnlyImportanciaChange = dtoKeys.length === 1 && dtoKeys[0] === 'importancia';

    // Rellenar defaults en endpoint si existen cambios parciales
    if (dto.endpoint) {
      dto.endpoint.metodo = dto.endpoint.metodo || dto.endpoint.method || 'GET';
      const defaultExpectedCode = process.env.HEALTH_CHECK_EXPECTED_CODE_DEFAULT
        ? Number(process.env.HEALTH_CHECK_EXPECTED_CODE_DEFAULT)
        : 200;
      dto.endpoint.codigoEsperado = dto.endpoint.codigoEsperado ?? defaultExpectedCode;
      dto.endpoint.timeoutMs = dto.endpoint.timeoutMs ?? (process.env.HEALTH_CHECK_TIMEOUT_MS ? Number(process.env.HEALTH_CHECK_TIMEOUT_MS) : 10000);
    }

    // Si el usuario está cambiando la importancia, activar override automáticamente
    if (dto.importancia !== undefined && dto.manualImportanciaOverride === undefined) {
      dto.manualImportanciaOverride = true;
      this.logger.log(`Activating manualImportanciaOverride for ${id} due to manual importancia change`);
    }

    dto.fechaActualizacion = new Date().toISOString();
    const updated = await this.serviceModel.findByIdAndUpdate(id, dto, { new: true });
    
    // No ejecutar check inmediato si:
    // - Se está restaurando el servicio
    // - Se está saliendo/entrando de mantenimiento
    // - Solo se está cambiando manualOverride (al resolver/eliminar incidente)
    const shouldSkipImmediateCheck = isBeingRestored || isLeavingMaintenance || isEnteringMaintenance || isOnlyManualOverrideChange;
    
    if (!shouldSkipImmediateCheck) {
      try {
        if (updated && this.healthChecksService) await this.healthChecksService.runCheckForService(updated);
      } catch (err) {
        console.warn('No se pudo ejecutar health check tras update:', err?.message || err);
      }
    } else {
      if (isBeingRestored) {
        this.logger.log(`Skipping immediate check for ${id} because service is being restored (scheduler will handle it)`);
      }
      if (isLeavingMaintenance) {
        this.logger.log(`Skipping immediate check for ${id} because service is leaving maintenance (scheduler will handle it)`);
      }
      if (isEnteringMaintenance) {
        this.logger.log(`Skipping immediate check for ${id} because service is entering maintenance (scheduler will be unregistered)`);
      }
      if (isOnlyManualOverrideChange) {
        this.logger.log(`Skipping immediate check for ${id} because only manualOverride is changing (incident resolved/deleted)`);
      }
    }
    
    // Re-registrar scheduler solo si hay cambios que lo requieran
    // - Sí re-registrar si cambió importancia (afecta intervalos del scheduler)
    // - No re-registrar si solo cambió manualOverride (no afecta intervalos)
    const shouldReregisterScheduler = !isOnlyManualOverrideChange;
    
    if (shouldReregisterScheduler) {
      try {
        if (updated && this.healthChecksService) {
          if (this.healthChecksService.unregisterServiceScheduler) {
            await this.healthChecksService.unregisterServiceScheduler(id);
          }
          // Si solo cambió importancia, agregar delay para evitar race condition con check actual
          if (isOnlyImportanciaChange) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (this.healthChecksService.registerServiceScheduler) {
            await this.healthChecksService.registerServiceScheduler(updated);
          }
        }
      } catch (err) {
        console.warn('No se pudo re-registrar scheduler tras update:', err?.message || err);
      }
    } else {
      this.logger.log(`Skipping scheduler re-registration for ${id} because only manualOverride changed`);
    }
    return updated;
  }

  async remove(id: string, hard = false) {
    if (!hard) {
      // Soft-delete: marcar inactivo y fechaBorrado
      const updated = await this.serviceModel.findByIdAndUpdate(id, { activo: false, fechaBorrado: new Date().toISOString(), fechaActualizacion: new Date().toISOString() }, { new: true });
      // Desregistrar scheduler
      try {
        if (this.healthChecksService && this.healthChecksService.unregisterServiceScheduler) await this.healthChecksService.unregisterServiceScheduler(id);
      } catch (err) {
        console.warn('No se pudo desregistrar scheduler tras soft-remove:', err?.message || err);
      }
      return updated;
    }

    // Hard delete: eliminar documento y opcionalmente borrar health checks asociados
    const removed = await this.serviceModel.findByIdAndDelete(id);
    try {
      if (this.healthChecksService && this.healthChecksService.unregisterServiceScheduler) await this.healthChecksService.unregisterServiceScheduler(id);
    } catch (err) {
      console.warn('No se pudo desregistrar scheduler tras hard remove:', err?.message || err);
    }
    try {
      if (this.healthChecksService && this.healthChecksService.deleteByService) {
        await this.healthChecksService.deleteByService(id);
      }
    } catch (err) {
      console.warn('No se pudieron eliminar health checks asociados tras hard remove:', err?.message || err);
    }
    return removed;
  }

  // Devuelve los health checks recientes para diagnóstico (usa HealthChecksService)
  async getRecentChecksForService(serviceId: string, limit = 5) {
    if (!this.healthChecksService) return [];
    return this.healthChecksService.getRecentByService(serviceId, limit);
  }

  // Ejecutar un health check inmediato para un servicio y devolver los checks recientes
  async runImmediateCheck(serviceId: string, limit = 1) {
    const service = await this.serviceModel.findById(serviceId).exec();
    if (!service) return null;
    try {
      if (this.healthChecksService) await this.healthChecksService.runCheckForService(service);
    } catch (err) {
      this.logger.warn('No se pudo ejecutar health check inmediato:', err?.message || err);
    }
    return this.getRecentChecksForService(serviceId, limit);
  }

  // Recalcular y actualizar el estado del servicio a partir de los últimos health checks
  async updateEstadoFromChecks(serviceId: string, limit = 5) {
    const service = await this.serviceModel.findById(serviceId).exec();
    if (!service) return null;

    // No sobreescribir si hay override o maintenance mode
    if (service.manualOverride || service.maintenanceMode) return service;

    if (!this.healthChecksService) return service;

    const checks = await this.healthChecksService.getRecentByService(serviceId, limit);
    if (!checks || !checks.length) return service;

    const total = checks.length;
    // Calculamos un promedio ponderado donde los checks más recientes pesan más.
    // checks[0] es el más reciente (getRecentByService devuelve orden descendente por fecha)
    const weights: number[] = [];
    // peso simple: (limit - idx)
    for (let i = 0; i < checks.length; i++) {
      weights.push(checks.length - i);
    }
    const weightSum = weights.reduce((s, v) => s + v, 0);

    let wOperational = 0;
    let wDegradado = 0;
    let wImpactado = 0;
    let wInterruption = 0;

    checks.forEach((c: any, idx: number) => {
      const w = weights[idx] / weightSum;
      const s = c.estado;
      this.logger.debug(`Check ${idx}: estado="${s}", weight=${w.toFixed(3)}`);
      if (s === 'Operando normalmente') wOperational += w;
      else if (s === 'Degradado') wDegradado += w;
      else if (s === 'Impactado') wImpactado += w;
      else if (s === 'Interrumpido') wInterruption += w;
      else wDegradado += w; // desconocido -> problema leve
    });

    const newEstadoCandidates = {
      operando: wOperational,
      degradado: wDegradado,
      impactado: wImpactado,
      interrumpido: wInterruption,
    };

    this.logger.log(`Weighted health checks for ${serviceId}: ${JSON.stringify(newEstadoCandidates)}`);

    let newEstado = 'Operando normalmente';

    // Determinar estado basado en peso mayoritario (orden de severidad)
    if (wInterruption >= 0.5) newEstado = 'Interrumpido';
    else if (wImpactado >= 0.5) newEstado = 'Impactado';
    else if (wDegradado >= 0.5) newEstado = 'Degradado';
    else if (wOperational >= 0.6) newEstado = 'Operando normalmente';
    else {
      // Fallback: elegir el que tenga mayor peso
      const maxWeight = Math.max(wInterruption, wImpactado, wDegradado, wOperational);
      if (maxWeight === wInterruption && wInterruption > 0) newEstado = 'Interrumpido';
      else if (maxWeight === wImpactado && wImpactado > 0) newEstado = 'Impactado';
      else if (maxWeight === wDegradado && wDegradado > 0) newEstado = 'Degradado';
      else if (maxWeight === wOperational && wOperational > 0) newEstado = 'Operando normalmente';
      else newEstado = 'Degradado'; // Default fallback
    }

    if (service.estado !== newEstado) {
      service.estado = newEstado;
      service.fechaActualizacion = new Date().toISOString();
      await service.save();
    }

    return service;
  }
}