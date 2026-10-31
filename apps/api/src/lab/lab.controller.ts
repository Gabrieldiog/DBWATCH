import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermission } from '../auth/permissions';
import { currentUser } from '../auth/session.guard';
import { LabService } from './lab.service';

@ApiTags('Laboratório (LAB)')
@ApiCookieAuth()
@Controller('lab')
export class LabController {
  constructor(private readonly lab: LabService) {}

  @Get('scenarios')
  @RequirePermission('lab:run')
  @ApiOperation({ summary: 'LAB: cenários de concorrência disponíveis' })
  scenarios() {
    return this.lab.scenarios();
  }

  @Post(':scenario/run')
  @HttpCode(200)
  @RequirePermission('lab:run')
  @ApiOperation({ summary: 'LAB: roda o cenário com duas sessões reais; devolve cada passo com tempo e SQLSTATE' })
  run(@Param('scenario') scenario: string, @Req() req: Request) {
    return this.lab.run(scenario, currentUser(req).id);
  }

  @Get('runs')
  @RequirePermission('lab:run')
  @ApiOperation({ summary: 'LAB: últimas execuções' })
  runs() {
    return this.lab.runs();
  }
}
