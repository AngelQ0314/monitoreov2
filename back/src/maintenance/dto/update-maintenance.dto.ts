export class UpdateMaintenanceDto {
  estado?: 'Programado' | 'En progreso' | 'Finalizado';
  fechaInicio?: Date | string;
  fechaFin?: Date | string;
  activo?: boolean;
  impacto?: 'completo' | 'parcial' | 'informativo';
  modo?: 'pause' | 'reduce';
  multiplier?: number;
}
