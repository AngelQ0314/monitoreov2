import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { ServicesModule } from './services/services.module';
import { ConfigModule } from '@nestjs/config';
import { IncidentsModule } from './incidents/incidents.module';
import { HealthChecksModule } from './health-checks/health-checks.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [
    ConfigModule.forRoot({isGlobal: true}),
    HttpModule,
    DatabaseModule, 
    ServicesModule, 
    IncidentsModule, 
    HealthChecksModule, 
    MaintenanceModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
