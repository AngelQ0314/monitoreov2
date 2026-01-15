import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'maintenance', timestamps: true })
export class Maintenance {


  @Prop({ type: String, required: true })
  serviceId: string;

  @Prop({ type: String, required: true })
  titulo: string;

  @Prop({ type: String })
  descripcion?: string;

  @Prop({ type: String, enum: ['Programado', 'En progreso', 'Finalizado'], default: 'Programado' })
  estado: string;

  @Prop({ type: String })
  cadena?: string;

  @Prop({ type: String })
  restaurante?: string;

  @Prop({ type: Date, required: true })
  fechaInicio: Date;

  @Prop({ type: Date })
  fechaFin?: Date;

  // campo legado / compatibilidad
  @Prop({ type: Date })
  fechaCreacion?: Date;

  @Prop({ type: Boolean, default: true })
  activo: boolean;

  @Prop({ type: String, enum: ['programado', 'no-programado'], default: 'programado' })
  tipo: string;

  @Prop({ type: String, enum: ['completo', 'parcial', 'informativo'], default: 'parcial' })
  impacto: string;

  @Prop({ type: String, enum: ['pause', 'reduce'], default: 'pause' })
  modo?: string;

  @Prop({ type: Number })
  multiplier?: number;

  @Prop({ type: String })
  creadoPor?: string;
}

export const MaintenanceSchema = SchemaFactory.createForClass(Maintenance);
MaintenanceSchema.index({ serviceId: 1, activo: 1, fechaInicio: 1 });
