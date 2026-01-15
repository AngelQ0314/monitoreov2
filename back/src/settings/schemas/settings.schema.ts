import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'settings' })
export class Settings {
  @Prop()
  _id: string;

  @Prop()
  healthCheckOperandoS: number;

  @Prop()
  healthCheckDegradadoS: number;

  @Prop()
  intervalHighS: number;

  @Prop()
  intervalMediumS: number;

  @Prop()
  intervalLowS: number;

  @Prop()
  jitterMaxS: number;

  @Prop()
  timeoutMs: number;
  
  @Prop({ type: String, enum: ['pause', 'reduce'] })
  maintenanceDefaultMode?: string;

  @Prop({ type: Number })
  maintenanceDefaultMultiplier?: number;

  @Prop({ type: Boolean, default: true })
  autoIncidentCreation?: boolean;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
