import { Module } from '@nestjs/common';
import { GrantsController } from './grants.controller';
import { GrantsService } from './grants.service';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({ controllers: [RequestsController, GrantsController, QueriesController],
  providers: [RequestsService, GrantsService, QueriesService], })
export class PamModule {}
