import { Module } from '@nestjs/common';
import { BreakGlassController } from './break-glass.controller';
import { BreakGlassService } from './break-glass.service';
import { GrantsController } from './grants.controller';
import { GrantsService } from './grants.service';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({ controllers: [RequestsController, GrantsController, QueriesController, BreakGlassController],
  providers: [RequestsService, GrantsService, QueriesService, BreakGlassService], })
export class PamModule {}
