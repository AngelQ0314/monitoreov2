import { IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  healthCheckOperandoS?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  healthCheckDegradadoS?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  intervalHighS?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  intervalMediumS?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  intervalLowS?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  jitterMaxS?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  timeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  autoIncidentCreation?: boolean;
}
