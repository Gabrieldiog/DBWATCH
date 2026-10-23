import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { Env } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.forRoot(env)],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
