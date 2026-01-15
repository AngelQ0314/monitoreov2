import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'health_checks', timestamps: false })
export class HealthCheckEntity {
  @Prop({ required: true })
  _id: string;

  @Prop({ required: true })
  serviceId: string;

  @Prop({
    enum: [
      'Operando normalmente',
      'Impactado',
      'Degradado',
      'Interrumpido',
    ],
  })
  estado: string;

  @Prop()
  tiempoRespuestaMs: number;

  @Prop()
  codigoRespuesta: number;

  @Prop()
  mensaje: string;

  @Prop()
  fechaRevision: string;

  @Prop()
  cadena: string;

  @Prop()
  restaurante: string;

  @Prop({
    enum: ['alta', 'media', 'baja'],
    default: 'media',
  })
  importancia: string;
}

export const HealthCheckSchema =
  SchemaFactory.createForClass(HealthCheckEntity);
