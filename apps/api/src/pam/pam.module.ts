import { Module } from '@nestjs/common';
import { GrantsController } from './grants.controller';
import { GrantsService } from './grants.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({ controllers: [RequestsController, GrantsController], providers: [RequestsService, GrantsService] })
export class PamModule {}
