import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'incidents', timestamps: false })
export class IncidentEntity {
  @Prop({ required: true })
  serviceId: string;

  @Prop()
  titulo: string;

  @Prop()
  descripcion: string;

  @Prop({
    enum: ['Baja', 'Media', 'Alta'],
  })
  severidad: string;

  @Prop({
    enum: ['Abierto', 'En progreso', 'Resuelto'],
  })
  estado: string;

  @Prop()
  cadena: string;

  @Prop()
  restaurante: string;

  @Prop()
  fechaInicio: string;

  @Prop({ type: String, default: null })
  fechaResolucion: string | null;


  @Prop({
    type: [
      {
        mensaje: String,
        fecha: String,
      },
    ],
  })
  actualizaciones: {
    mensaje: string;
    fecha: string;
  }[];
}

export const IncidentSchema = SchemaFactory.createForClass(IncidentEntity);
