import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HealthCheckEntity } from './schemas/health-check.schema';
import { HttpService } from '@nestjs/axios';
import { ServicesService } from '../services/services.service';
import { SettingsService } from '../settings/settings.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HealthChecksService implements OnModuleInit {
  private readonly logger = new Logger(HealthChecksService.name);

  private readonly operandoMs: number;
  private readonly degradadoMs: number;
  private readonly intervalHighMs: number;
  private readonly intervalMedMs: number;
  private readonly intervalLowMs: number;
  private readonly jitterMaxMs: number;

  constructor(
    @InjectModel(HealthCheckEntity.name)
    private readonly model: Model<HealthCheckEntity>,
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService?: SettingsService,
    @Inject(forwardRef(() => (require('../incidents/incidents.service').IncidentsService)))
    private readonly incidentsService?: any,
    @Inject(forwardRef(() => (require('../maintenance/maintenance.service').MaintenanceService)))
    private readonly maintenanceService?: any,
  ) {
    // Interpretar valores proporcionados en variables de entorno (ahora con sufijo _S) como segundos
    this.operandoMs = process.env.HEALTH_CHECK_OPERANDO_S ? Number(process.env.HEALTH_CHECK_OPERANDO_S) * 1000 : 1000;
    this.degradadoMs = process.env.HEALTH_CHECK_DEGRADADO_S ? Number(process.env.HEALTH_CHECK_DEGRADADO_S) * 1000 : 7000;
    this.intervalHighMs = process.env.HEALTH_CHECK_INTERVAL_HIGH_S ? Number(process.env.HEALTH_CHECK_INTERVAL_HIGH_S) * 1000 : 30_000; // 30s
    this.intervalMedMs = process.env.HEALTH_CHECK_INTERVAL_MEDIUM_S ? Number(process.env.HEALTH_CHECK_INTERVAL_MEDIUM_S) * 1000 : 60_000; // 60s
    this.intervalLowMs = process.env.HEALTH_CHECK_INTERVAL_LOW_S ? Number(process.env.HEALTH_CHECK_INTERVAL_LOW_S) * 1000 : 300_000; // 5m
    this.jitterMaxMs = process.env.HEALTH_CHECK_JITTER_MAX_S ? Number(process.env.HEALTH_CHECK_JITTER_MAX_S) * 1000 : 60000; // up to 60s
    this.logger.log(`Using thresholds operando=${this.operandoMs/1000}s degradado=${this.degradadoMs/1000}s intervals high=${this.intervalHighMs/1000}s med=${this.intervalMedMs/1000}s low=${this.intervalLowMs/1000}s jitterMax=${this.jitterMaxMs/1000}s`);
  }

  // Devuelve un mantenimiento activo (si existe) para un servicio
  private async getActiveMaintenanceForService(serviceId: string) {
    if (!this.maintenanceService) return null;
    try {
      const list = await this.maintenanceService.findByService(serviceId);
      if (!list || !list.length) return null;
      const now = new Date();
      // buscar un mantenimiento activo y vigente
      for (const m of list) {
        const activo = m.activo !== false;
        let inicio: Date | null = m.fechaInicio ? new Date(m.fechaInicio) : null;
        let fin: Date | null = m.fechaFin ? new Date(m.fechaFin) : null;
        if (!inicio) continue;
        // si no hay fin, considerar vigente si estado no es Finalizado
        const withinRange = inicio <= now && (!fin || fin >= now);
        if (activo && withinRange) return m;
      }
      return null;
    } catch (err) {
      this.logger.warn('Error obteniendo mantenimiento activo:', err?.message || err);
      return null;
    }
  }

  // Devuelve el modo efectivo para un mantenimiento (incluye fallback a settings)
  private async getEffectiveMaintenanceMode(m: any) {
    if (!m) return null;
    if (m.modo) return m.modo;
    try {
      const s = this.settingsService ? await this.settingsService.get() : null;
      return s?.maintenanceDefaultMode || null;
    } catch (err) {
      this.logger.warn('Error obteniendo maintenanceDefaultMode from settings:', err?.message || err);
      return null;
    }
  }

  private async getEffectiveMaintenanceMultiplier(m: any) {
    if (!m) return null;
    if (m.multiplier !== undefined && m.multiplier !== null) return Number(m.multiplier) || null;
    try {
      const s = this.settingsService ? await this.settingsService.get() : null;
      return s?.maintenanceDefaultMultiplier ? Number(s.maintenanceDefaultMultiplier) : null;
    } catch (err) {
      this.logger.warn('Error obteniendo maintenanceDefaultMultiplier from settings:', err?.message || err);
      return null;
    }
  }

  // Reconfigurar schedulers según settings actuales
  async refreshAllSchedulers() {
    try {
      const services = await this.servicesService.findAll({ activo: 'true' });
      for (const s of services) {
        try {
          await this.unregisterServiceScheduler(s._id);
          // Delay de 100ms para asegurar que los timeouts recursivos vean que el scheduler fue eliminado
          await new Promise(resolve => setTimeout(resolve, 100));
          await this.registerServiceScheduler(s);
        } catch (err) {
          this.logger.warn(`Error re-registrando scheduler para ${s._id}: ${err?.message || err}`);
        }
      }
    } catch (err) {
      this.logger.warn('Error en refreshAllSchedulers:', err?.message || err);
    }
  }

  // Map to keep timeouts/intervals per service
  private schedulers: Map<string, { timeout?: NodeJS.Timeout; interval?: NodeJS.Timeout }> = new Map();

  async onModuleInit() {
    // Registrar schedulers para servicios activos al iniciar
    try {
      const services = await this.servicesService.findAll({ activo: 'true' });
      for (const s of services) {
        try {
          await this.registerServiceScheduler(s);
        } catch (err) {
          this.logger.warn(`No se pudo registrar scheduler para servicio ${s._id}: ${err?.message || err}`);
        }
      }
    } catch (err) {
      this.logger.warn('Error registrando schedulers en onModuleInit:', err?.message || err);
    }
  }

  async findAll(query: any) {
    const filter: any = {};

    if (query.serviceId) filter.serviceId = query.serviceId;
    if (query.estado) filter.estado = query.estado;
    if (query.cadena) filter.cadena = query.cadena;
    if (query.restaurante) filter.restaurante = query.restaurante;

    if (query.desde && query.hasta) {
      filter.fechaRevision = {
        $gte: query.desde,
        $lte: query.hasta,
      };
    }

    return this.model
      .find(filter)
      .sort({ fechaRevision: -1 })
      .limit(Number(query.limit) || 50);
  }

  async findByService(serviceId: string) {
    return this.model
      .find({ serviceId })
      .sort({ fechaRevision: -1 });
  }

  async getRecentByService(serviceId: string, limit = 5) {
    return this.model
      .find({ serviceId })
      .sort({ fechaRevision: -1 })
      .limit(limit)
      .exec();
  }

  // Permite ejecutar un health check inmediato sobre un servicio (usado por ServicesService)
  async runCheckForService(service: any, skipEscalation = false) {
    return this.checkServiceHealth(service, skipEscalation);
  }

  // Registrar un scheduler independiente por servicio (intervalo + jitter)
  async registerServiceScheduler(service: any) {
    if (!service || !service._id) return;
    const id = service._id.toString();

    // limpiar scheduler previo si existe
    await this.unregisterServiceScheduler(id);

    if (!service.activo) return;

    // Si hay un mantenimiento activo y su modo es 'pause', no registrar scheduler
    try {
      const m = await this.getActiveMaintenanceForService(id);
      const mode = await this.getEffectiveMaintenanceMode(m);
      if (m && mode === 'pause') {
        this.logger.debug(`Service ${id} is under maintenance (pause mode): scheduler not registered`);
        return;
      }
      // Si mantenimiento 'reduce', ajustamos interval más abajo
    } catch (err) {
      this.logger.warn('Error comprobando mantenimiento antes de registrar scheduler:', err?.message || err);
    }

    // Leer settings actuales si existen (overrides env defaults)
    let operandoMs = this.operandoMs;
    let degradadoMs = this.degradadoMs;
    let intervalHigh = this.intervalHighMs;
    let intervalMed = this.intervalMedMs;
    let intervalLow = this.intervalLowMs;
    let jitter = this.jitterMaxMs;
    let usingSettingsOverride = false;
    try {
      const s = this.settingsService ? await this.settingsService.get() : null;
      if (s) {
        operandoMs = s.healthCheckOperandoS ? s.healthCheckOperandoS * 1000 : operandoMs;
        degradadoMs = s.healthCheckDegradadoS ? s.healthCheckDegradadoS * 1000 : degradadoMs;
        intervalHigh = s.intervalHighS ? s.intervalHighS * 1000 : intervalHigh;
        intervalMed = s.intervalMediumS ? s.intervalMediumS * 1000 : intervalMed;
        intervalLow = s.intervalLowS ? s.intervalLowS * 1000 : intervalLow;
        jitter = s.jitterMaxS ? s.jitterMaxS * 1000 : jitter;
        usingSettingsOverride = true;
        this.logger.debug(`Using intervals from Settings: high=${intervalHigh/1000}s, med=${intervalMed/1000}s, low=${intervalLow/1000}s, jitter=${jitter/1000}s`);
      }
    } catch (err) {
      this.logger.warn('No se pudieron leer settings, usando valores por defecto');
    }

    const imp = (service.importancia || 'media').toString().toLowerCase();
    let interval = intervalMed;
    if (imp === 'alta' || imp === 'high') interval = intervalHigh;
    else if (imp === 'baja' || imp === 'low') interval = intervalLow;

    // Si hay mantenimiento con modo 'reduce', multiplicar el intervalo
    try {
      const m2 = await this.getActiveMaintenanceForService(id);
      const mode2 = await this.getEffectiveMaintenanceMode(m2);
      if (m2 && mode2 === 'reduce') {
        const mul = await this.getEffectiveMaintenanceMultiplier(m2);
        const multiplier = Number(mul || 3);
        interval = interval * multiplier;
        this.logger.debug(`Reduced frequency for ${id} due to maintenance (multiplier=${multiplier})`);
      }
    } catch (err) {
      this.logger.warn('Error comprobando mantenimiento (reduce):', err?.message || err);
    }

    const maxJitter = Math.min(jitter, interval);
    const jitterMs = Math.floor(Math.random() * (maxJitter + 1));

    // Programar primer check con jitter; luego programamos recursivamente con jitter variable
    const initialTimeout = setTimeout(async () => {
      try {
        await this.checkServiceHealth(service);
      } catch (err) {
        this.logger.warn(`Error en scheduled check inicial para ${id}: ${err?.message || err}`);
      }

      // Función recursiva que programa el siguiente check con jitter para evitar sincronización
      const scheduleNext = async () => {
        // Verificar si el scheduler fue desregistrado antes de programar el siguiente
        if (!this.schedulers.has(id)) {
          this.logger.debug(`Scheduler for ${id} was unregistered, stopping recursive checks`);
          return;
        }
        
        const perJitter = Math.floor(Math.random() * (Math.min(this.jitterMaxMs, interval) + 1));
        const delay = interval + perJitter;
        const t = setTimeout(async () => {
          try {
            await this.checkServiceHealth(service);
          } catch (err) {
            this.logger.warn(`Error en scheduled check periódico para ${id}: ${err?.message || err}`);
          }
          await scheduleNext();
        }, delay);

        const existing = this.schedulers.get(id);
        if (existing) {
          existing.timeout = t;
          this.schedulers.set(id, existing);
        }
      };

      await scheduleNext();
    }, jitterMs);

    this.schedulers.set(id, { timeout: initialTimeout });
    this.logger.log(`✅ Registered scheduler for ${id} | importancia=${imp} | interval=${interval/1000}s | jitter=${jitterMs/1000}s | source=${usingSettingsOverride ? 'Settings' : 'Env'}`);
  }

  async unregisterServiceScheduler(serviceId: string) {
    if (!serviceId) return;
    const existing = this.schedulers.get(serviceId);
    if (!existing) return;
    try {
      if (existing.timeout) clearTimeout(existing.timeout as unknown as any);
      if (existing.interval) clearInterval(existing.interval as unknown as any);
    } catch (err) {
      this.logger.warn(`Error clearing scheduler for ${serviceId}: ${err?.message || err}`);
    }
    this.schedulers.delete(serviceId);
    this.logger.debug(`Unregistered scheduler for ${serviceId}`);
  }

  // Borra todos los health checks asociados a un servicio (hard delete)
  async deleteByService(serviceId: string) {
    if (!serviceId) return;
    try {
      const res = await this.model.deleteMany({ serviceId }).exec();
      this.logger.log(`Deleted ${res.deletedCount || 0} health checks for service ${serviceId}`);
      return res;
    } catch (err) {
      this.logger.warn(`Error deleting health checks for ${serviceId}: ${err?.message || err}`);
      throw err;
    }
  }

  private async checkServiceHealth(service: any, skipEscalation = false) {
    if (!service.endpoint || !service.endpoint.url) {
      this.logger.warn(`Servicio ${service._id} no tiene endpoint.url configurado`);
      return;
    }
    // Comprobar mantenimiento activo antes de ejecutar
    try {
      const m = await this.getActiveMaintenanceForService(service._id?.toString());
      const mode = await this.getEffectiveMaintenanceMode(m);
      if (m) {
        // Si modo 'pause', saltar ejecución
        if (mode === 'pause') {
          this.logger.log(`Skipping check for ${service._id} due to maintenance (pause)`);
          return;
        }
        // modo 'mark' eliminado: no se crean checks sintéticos aquí.
        // modo 'reduce' no requiere acción aquí (ya ajustado intervalos)
      }
    } catch (err) {
      this.logger.warn('Error comprobando mantenimiento antes de check:', err?.message || err);
    }
    const url = service.endpoint.url;
    const method = service.endpoint.metodo || service.endpoint.method || 'GET';
    const expectedCode = service.endpoint.codigoEsperado || 200;
    const timeout = service.endpoint.timeoutMs || service.endpoint.timeout || 10000;
    // Modo simulado: no realizar peticiones reales, usar métricas simuladas o valores suministrados
    if (process.env.HEALTH_CHECK_SIMULATED === 'true') {
      const simulatedResponseTime =
        service.metricas?.ultimoTiempoRespuestaMs ?? Math.floor(Math.random() * 2000) + 200;
      const simulatedStatus = this.determineStatus(expectedCode, simulatedResponseTime, expectedCode);

      await this.createHealthCheckRecord(service, {
        _id: `${service._id}_${Date.now()}`,
        serviceId: service._id,
        estado: simulatedStatus,
        tiempoRespuestaMs: simulatedResponseTime,
        codigoRespuesta: expectedCode,
        mensaje: 'Simulated',
        fechaRevision: new Date().toISOString(),
        cadena: service.clasificacion?.cadena,
        restaurante: service.clasificacion?.restaurante,
      }, skipEscalation);

      this.logger.log(`(Simulado) Health check para ${service.nombre}: ${simulatedStatus}`);
      try {
        if (this.servicesService) await this.maybeUpdateEstadoFromChecks(service._id);
      } catch (err) {
        this.logger.warn('No se pudo actualizar estado del servicio tras health check simulado:', err?.message || err);
      }
      return;
    }
    let parsed: URL | null = null;

    try {
      parsed = new URL(url);
    } catch (err) {
      this.logger.warn(`URL inválida para servicio ${service._id}: ${url}`);
      await this.createHealthCheckRecord(service, {
        _id: `${service._id}_${Date.now()}`,
        serviceId: service._id,
        estado: 'Interrumpido',
        tiempoRespuestaMs: 0,
        codigoRespuesta: 0,
        mensaje: `URL inválida: ${url}`,
        fechaRevision: new Date().toISOString(),
        cadena: service.clasificacion?.cadena,
        restaurante: service.clasificacion?.restaurante,
      }, skipEscalation);
      return;
    }

    // Soportar solo http(s) en el health check actual
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      const protocolo = parsed.protocol.replace(':', '');
      this.logger.warn(`Protocolo no soportado para health check: ${protocolo}`);
      await this.createHealthCheckRecord(service, {
        _id: `${service._id}_${Date.now()}`,
        serviceId: service._id,
        estado: 'Interrumpido',
        tiempoRespuestaMs: 0,
        codigoRespuesta: 0,
        mensaje: `Unsupported protocol ${protocolo}`,
        fechaRevision: new Date().toISOString(),
        cadena: service.clasificacion?.cadena,
        restaurante: service.clasificacion?.restaurante,
      }, skipEscalation);
      return;
    }
    const startTime = Date.now();

    try {
      const requestOptions: any = {
        method,
        url,
        timeout,
      };

      if (parsed.protocol === 'https:') {
        // Evitar errores SNI especificando servername
        requestOptions.httpsAgent = new (require('https').Agent)({
          rejectUnauthorized: false,
          servername: parsed.hostname,
        });
      }

      const response = await firstValueFrom(
        this.httpService.request(requestOptions)
      );

      const responseTime = Date.now() - startTime;
      const status = this.determineStatus(response.status, responseTime, expectedCode);

      const created = await this.createHealthCheckRecord(service, {
        _id: `${service._id}_${Date.now()}`,
        serviceId: service._id,
        estado: status,
        tiempoRespuestaMs: responseTime,
        codigoRespuesta: response.status,
        mensaje: response.status === expectedCode ? 'OK' : `Código ${response.status} (esperado ${expectedCode})`,
        fechaRevision: new Date().toISOString(),
        cadena: service.clasificacion?.cadena,
        restaurante: service.clasificacion?.restaurante,
      }, skipEscalation);

      this.logger.log(`Health check para ${service.nombre}: ${status}`);
      try {
        if (this.servicesService) await this.maybeUpdateEstadoFromChecks(service._id);
      } catch (err) {
        this.logger.warn('No se pudo actualizar estado del servicio tras health check:', err?.message || err);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Detectar timeout
      const isTimeout = error?.code === 'ECONNABORTED' || (error?.message && String(error.message).toLowerCase().includes('timeout'));

      // Si fue timeout, intentar 1 reintento con timeout mayor
      if (isTimeout) {
        try {
          const retryOptions: any = {
            method,
            url,
            timeout: Math.min((timeout || 10000) * 2, 30000),
          };
          if (parsed?.protocol === 'https:') {
            retryOptions.httpsAgent = new (require('https').Agent)({
              rejectUnauthorized: false,
              servername: parsed.hostname,
            });
          }

          const retryResponse = await firstValueFrom(this.httpService.request(retryOptions));
          const retryTime = Date.now() - startTime;
          const retryStatus = this.determineStatus(retryResponse.status, retryTime, expectedCode);

          await this.createHealthCheckRecord(service, {
            _id: `${service._id}_${Date.now()}`,
            serviceId: service._id,
            estado: retryStatus,
            tiempoRespuestaMs: retryTime,
            codigoRespuesta: retryResponse.status,
            mensaje: 'OK (retry)',
            fechaRevision: new Date().toISOString(),
            cadena: service.clasificacion?.cadena,
            restaurante: service.clasificacion?.restaurante,
          }, skipEscalation);

          this.logger.log(`Health check (retry) para ${service.nombre}: ${retryStatus}`);
          try {
            if (this.servicesService) await this.maybeUpdateEstadoFromChecks(service._id);
          } catch (err) {
            this.logger.warn('No se pudo actualizar estado del servicio tras health check (retry):', err?.message || err);
          }
          return;
        } catch (retryErr) {
          // Si el retry también falla por timeout, consideramos Degradado en lugar de Interrumpido
          const status = 'Degradado';
          await this.createHealthCheckRecord(service, {
            _id: `${service._id}_${Date.now()}`,
            serviceId: service._id,
            estado: status,
            tiempoRespuestaMs: responseTime,
            codigoRespuesta: retryErr.response?.status || 0,
            mensaje: 'timeout exceeded',
            fechaRevision: new Date().toISOString(),
            cadena: service.clasificacion?.cadena,
            restaurante: service.clasificacion?.restaurante,
          }, skipEscalation);

          this.logger.warn(`Health check timeout para ${service.nombre}: ${retryErr?.message || retryErr}`);
          try {
            if (this.servicesService) await this.maybeUpdateEstadoFromChecks(service._id);
          } catch (err) {
            this.logger.warn('No se pudo actualizar estado del servicio tras health check fallido:', err?.message || err);
          }
          return;
        }
      }

      // Si hay respuesta con código de estado (4xx/5xx), clasificar según determineStatus
      if (error?.response && typeof error.response.status === 'number') {
        const httpStatus = error.response.status;
        const computed = this.determineStatus(httpStatus, responseTime, expectedCode);
        await this.createHealthCheckRecord(service, {
          _id: `${service._id}_${Date.now()}`,
          serviceId: service._id,
          estado: computed,
          tiempoRespuestaMs: responseTime,
          codigoRespuesta: httpStatus,
          mensaje: `Request failed with status code ${httpStatus}`,
          fechaRevision: new Date().toISOString(),
          cadena: service.clasificacion?.cadena,
          restaurante: service.clasificacion?.restaurante,
        }, skipEscalation);

        this.logger.warn(`Health check para ${service.nombre}: Request failed with status code ${httpStatus}`);
        try {
          if (this.servicesService) await this.maybeUpdateEstadoFromChecks(service._id);
        } catch (err) {
          this.logger.warn('No se pudo actualizar estado del servicio tras health check fallido:', err?.message || err);
        }
        return;
      }

      // Errores de red u otros -> Interrumpido
      const status = 'Interrumpido';
      await this.createHealthCheckRecord(service, {
        _id: `${service._id}_${Date.now()}`,
        serviceId: service._id,
        estado: status,
        tiempoRespuestaMs: responseTime,
        codigoRespuesta: error.response?.status || 0,
        mensaje: error.message || 'Error de conexión',
        fechaRevision: new Date().toISOString(),
        cadena: service.clasificacion?.cadena,
        restaurante: service.clasificacion?.restaurante,
      }, skipEscalation);

      this.logger.warn(`Health check fallido para ${service.nombre}: ${error?.message || error}`);
      try {
        if (this.servicesService) await this.servicesService.updateEstadoFromChecks(service._id);
      } catch (err) {
        this.logger.warn('No se pudo actualizar estado del servicio tras health check fallido:', err?.message || err);
      }
    }
  }

  private determineStatus(statusCode: number, responseTime: number, expectedCode: number = 200): string {
    // Si la respuesta coincide con el código esperado, decidir según tiempos configurables
    if (statusCode === expectedCode) {
      if (responseTime < this.operandoMs) return 'Operando normalmente';
      if (responseTime < this.degradadoMs) return 'Degradado';
      return 'Impactado';
    }

    // Clasificar 4xx como Impactado (errores de cliente), 5xx como Interrumpido (errores de servidor)
    if (statusCode >= 400 && statusCode < 500) return 'Impactado';
    return 'Interrumpido';
  }

  // Helper: create health check record and escalate service importancia if needed
  private async createHealthCheckRecord(service: any, record: any, skipEscalation = false) {
    // Ensure importancia is recorded
    record.importancia = service.importancia || 'media';
    const created = await this.model.create(record);

    // Escalamiento: sólo aumentar, nunca disminuir automáticamente
    // Respetar override manual del usuario
    try {
      // Si el usuario ha bloqueado el escalamiento automático, no modificar importancia
      if (skipEscalation) {
        this.logger.debug(`Skipping auto-escalation for ${service._id} (skipEscalation flag)`);
      } else if (service.manualImportanciaOverride) {
        this.logger.debug(`Skipping auto-escalation for ${service._id} due to manual override`);
      } else {
        const current = (service.importancia || 'media').toString().toLowerCase();
        const desired = this.desiredImportanceForEstado(record.estado);
        const order = ['baja', 'media', 'alta'];
        const curIdx = order.indexOf(current) >= 0 ? order.indexOf(current) : 1;
        const desIdx = order.indexOf(desired) >= 0 ? order.indexOf(desired) : curIdx;
        if (desIdx > curIdx) {
          // Bump importance
          if (this.servicesService && this.servicesService.update) {
            await this.servicesService.update(service._id, { importancia: desired });
            this.logger.log(`Increased importancia for ${service._id} from ${current} to ${desired}`);
          }
        }
      }
    } catch (err) {
      this.logger.warn('Error escalating importancia:', err?.message || err);
    }

    // After creating a health check record, evaluate potential incident creation
    try {
      await this.maybeReportIncident(service, created);
    } catch (err) {
      this.logger.warn('Error reporting incident from health check:', err?.message || err);
    }

    return created;
  }

  // Report an incident automatically if last N checks are failures (MVP: N=3)
  private async maybeReportIncident(service: any, record: any) {
    if (!this.incidentsService) return;
    // Respect settings flag to enable/disable automatic incident creation
    try {
      const s = this.settingsService ? await this.settingsService.get() : null;
      if (s && s.autoIncidentCreation === false) {
        this.logger.debug('Auto incident creation is disabled by settings');
        return;
      }
    } catch (err) {
      this.logger.warn('Error reading settings for autoIncidentCreation:', err?.message || err);
    }
    if (!service || !service._id) return;

    // Consider a failure any estado different than 'Operando normalmente'
    const estado = (record.estado || '').toString();
    if (estado === 'Operando normalmente') return;

    // Get the last 3 checks (including the one just created)
    let recent: any[] = [];
    try {
      recent = await this.getRecentByService(service._id, 3);
    } catch (err) {
      this.logger.warn('Error fetching recent health checks for incident detection:', err?.message || err);
      return;
    }

    const failures = recent.filter(r => (r.estado || '') !== 'Operando normalmente');
    if (failures.length < 3) return;

    // Check if there's an open incident for this service
    let openIncidents: any[] = [];
    try {
      const all = await this.incidentsService.findByService(service._id);
      openIncidents = (Array.isArray(all) ? all : [all]).filter((i: any) => (i.estado || '').toString() !== 'Resuelto');
    } catch (err) {
      this.logger.warn('Error checking existing incidents:', err?.message || err);
    }
    if (openIncidents.length) {
      // there is already an open incident; append an update
      try {
        const inc = openIncidents[0];
        await this.incidentsService.addUpdate(inc._id, { mensaje: `Auto-update: ${failures.length} consecutive failing checks`, fecha: new Date().toISOString() });
      } catch (err) {
        this.logger.warn('Error adding auto-update to existing incident:', err?.message || err);
      }
      return;
    }

    // Create a new incident
    try {
      const severityMap: any = {
        'Interrumpido': 'Alta',
        'Impactado': 'Alta',
        'Degradado': 'Media',
      };
      const sev = severityMap[estado] || 'Alta';
      const dto: any = {
        serviceId: service._id,
        titulo: `Auto: ${service.nombre || service._id} - ${estado}`,
        descripcion: `Auto-detected ${failures.length} consecutive failing health checks. Last message: ${record.mensaje || ''}`,
        severidad: sev,
        estado: 'Abierto',
        cadena: service.clasificacion?.cadena,
        restaurante: service.clasificacion?.restaurante,
        fechaInicio: new Date().toISOString(),
      };

      await this.incidentsService.create(dto);
      this.logger.log(`Auto-created incident for service ${service._id} due to ${failures.length} failed checks`);
    } catch (err) {
      this.logger.warn('Error auto-creating incident:', err?.message || err);
    }
  }

  private desiredImportanceForEstado(estado: string): string {
    if (!estado) return 'media';
    const s = estado.toString().toLowerCase();
    if (s === 'interrumpido' || s === 'impactado') return 'alta';
    if (s === 'degradado') return 'media';
    return 'baja';
  }

  // Only update service estado from checks if there is no manual override (e.g., open incident)
  private async maybeUpdateEstadoFromChecks(serviceId: any) {
    try {
      if (!this.servicesService || !serviceId) return;

      // Try to obtain the service via public API (findAll supports id filter)
      let svc: any = null;
      if (typeof this.servicesService.findAll === 'function') {
        const list = await this.servicesService.findAll({ id: serviceId });
        svc = Array.isArray(list) ? list[0] : list;
      }

      if (svc && svc.manualOverride) {
        this.logger.debug(`Skipping updateEstadoFromChecks for ${serviceId} due to manualOverride`);
        return;
      }

      if (typeof this.servicesService.updateEstadoFromChecks === 'function') {
        await this.servicesService.updateEstadoFromChecks(serviceId);
      }
    } catch (err) {
      this.logger.warn('Error in maybeUpdateEstadoFromChecks:', err?.message || err);
    }
  }
}
