export class CreateMaintenanceDto {
  _id?: string;
  serviceId: string;
  titulo: string;
  descripcion?: string;
  estado?: 'Programado' | 'En progreso' | 'Finalizado';
  cadena?: string;
  restaurante?: string;
  fechaInicio: Date | string;
  fechaFin?: Date | string;
  tipo?: 'programado' | 'no-programado';
  impacto?: 'completo' | 'parcial' | 'informativo';
  activo?: boolean;
  creadoPor?: string;
  modo?: 'pause' | 'reduce';
  multiplier?: number;
}

