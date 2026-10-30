import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/permissions';
import { MonitorService } from './monitor.service';

@ApiTags('Monitor')
@ApiCookieAuth()
@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  @Get('overview')
  @RequirePermission('monitor:read')
  @ApiOperation({ summary: 'Última amostra: sessões por estado, esperas por lock e pares bloqueados' })
  overview() {
    return this.monitor.overview();
  }

  @Get('locks')
  @RequirePermission('monitor:read')
  @ApiOperation({ summary: 'Quem está esperando quem, na última amostra' })
  locks() {
    return this.monitor.locks();
  }

  @Get('series')
  @RequirePermission('monitor:read')
  @ApiOperation({ summary: 'Commits, rollbacks, deadlocks e cache hit por intervalo (LAG entre amostras)' })
  series(@Query('minutes', new DefaultValuePipe(30), ParseIntPipe) minutes: number) {
    return this.monitor.series(Math.min(Math.max(minutes, 1), 1440));
  }
}
