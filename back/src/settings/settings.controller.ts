import { Controller, Get, Put, Body, Inject, forwardRef, UsePipes, ValidationPipe } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { HealthChecksService } from '../health-checks/health-checks.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => HealthChecksService))
    private readonly healthChecksService: HealthChecksService,
  ) {}

  @Get()
  async get() {
    const s = await this.settingsService.get();
    return s;
  }

  @Put()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async update(@Body() body: UpdateSettingsDto) {
    // Obtener valores actuales
    const current = await this.settingsService.get();
    
    const payload: any = {
      healthCheckOperandoS: body.healthCheckOperandoS,
      healthCheckDegradadoS: body.healthCheckDegradadoS,
      intervalHighS: body.intervalHighS,
      intervalMediumS: body.intervalMediumS,
      intervalLowS: body.intervalLowS,
      jitterMaxS: body.jitterMaxS,
      timeoutMs: body.timeoutMs,
      autoIncidentCreation: body.autoIncidentCreation,
    };
    
    // Solo refrescar schedulers si REALMENTE cambiaron los intervalos o jitter
    const shouldRefreshSchedulers = current && (
      (body.intervalHighS !== undefined && body.intervalHighS !== current.intervalHighS) ||
      (body.intervalMediumS !== undefined && body.intervalMediumS !== current.intervalMediumS) ||
      (body.intervalLowS !== undefined && body.intervalLowS !== current.intervalLowS) ||
      (body.jitterMaxS !== undefined && body.jitterMaxS !== current.jitterMaxS)
    );
    
    const updated = await this.settingsService.upsert(payload);
    
    // Refresh schedulers solo si cambiaron intervalos/jitter
    if (shouldRefreshSchedulers) {
      try {
        if (this.healthChecksService && typeof this.healthChecksService.refreshAllSchedulers === 'function') {
          await this.healthChecksService.refreshAllSchedulers();
        }
      } catch (err) {
        // ignore
      }
    }
    
    return updated;
  }
}
