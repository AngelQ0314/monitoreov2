import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'services', timestamps: false })
export class ServiceEntity {
  @Prop({ required: true })
  _id: string;

  @Prop()
  nombre: string;

  @Prop()
  descripcion: string;

  @Prop()
  tipo: string;

  @Prop()
  ambiente: string;

  @Prop({
    enum: [
      'Operando normalmente',
      'Impactado',
      'Degradado',
      'Interrumpido',
    ],
  })
  estado: string;

  @Prop({ type: Object })
  clasificacion: {
    cadena: string;
    restaurante: string;
  };

  @Prop({
    type: {
      url: String,
      metodo: { type: String, default: 'GET' },
      codigoEsperado: { type: Number, default: 200 },
      timeoutMs: { type: Number, default: 10000 },
    },
    default: null,
  })
  endpoint: {
    url?: string;
    metodo?: string;
    codigoEsperado?: number;
    timeoutMs?: number;
  };

  @Prop({ type: Object })
  metricas: any;

  @Prop()
  ultimaRevision: String;

  @Prop()
  activo: boolean;

  @Prop()
  fechaCreacion: String;

  @Prop()
  fechaActualizacion: String;

  @Prop({ default: false })
  maintenanceMode: boolean;

  @Prop({ default: false })
  manualOverride: boolean;

  @Prop()
  overrideReason: string;

  @Prop({
    enum: ['alta', 'media', 'baja'],
    default: 'media',
    required: true,
  })
  importancia: 'alta' | 'media' | 'baja';

  @Prop({ default: false })
  manualImportanciaOverride: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(ServiceEntity);

