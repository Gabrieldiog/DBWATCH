import { Module } from '@nestjs/common';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassService } from './break-glass.service';
import { ConsoleController } from './console.controller';
import { ConsoleService } from './console.service';
import { GrantsController } from './grants.controller';
import { GrantsService } from './grants.service';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({ controllers: [RequestsController, GrantsController, QueriesController, BreakGlassController, ConsoleController],
  providers: [RequestsService, GrantsService, QueriesService, BreakGlassService, ConsoleService],
  // O bot da simulação (LAB) usa os mesmos serviços, com as mesmas regras
  exports: [RequestsService, GrantsService, QueriesService] })
export class PamModule {}
