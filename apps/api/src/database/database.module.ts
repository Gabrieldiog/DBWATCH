import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Env } from '../config/env';
import { DatabaseService, ENV } from './database.service';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: ENV, useValue: env }, DatabaseService],
      exports: [DatabaseService],
    };
  }
}
