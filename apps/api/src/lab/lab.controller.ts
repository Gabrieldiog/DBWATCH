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

  @Post('simulacao')
  @HttpCode(202)
  @RequirePermission('lab:run')
  @ApiOperation({ summary: 'LAB: o bot da simulação (uns 55 s): um acesso do começo ao fim, o incidente "fechamento do mês" e a verificação da trilha; cada passo aparece no Monitor' })
  simulate(@Req() req: Request) {
    return this.lab.simulate(currentUser(req).email);
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
