import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthChecksModule } from '../health-checks/health-checks.module';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { ServiceEntity, ServiceSchema } from './schemas/service.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServiceEntity.name, schema: ServiceSchema },
    ]),
    forwardRef(() => HealthChecksModule),
  ],
  providers: [ServicesService],
  controllers: [ServicesController],
  exports: [ServicesService],  // ← Agregado
})
export class ServicesModule {}
