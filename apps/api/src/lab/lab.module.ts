import { Module } from '@nestjs/common';
import { PamModule } from '../pam/pam.module';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';
import { StoryService } from './story.service';

@Module({ imports: [PamModule], controllers: [LabController], providers: [LabService, StoryService] })
export class LabModule {}
