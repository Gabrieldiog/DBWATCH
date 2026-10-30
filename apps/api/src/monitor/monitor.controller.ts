import { Controller, DefaultValuePipe, Get, type MessageEvent, ParseIntPipe, Query, Sse } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/permissions';
import { interval, map, merge, type Observable } from 'rxjs';
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

  @Get('events')
  @RequirePermission('monitor:read')
  @ApiOperation({ summary: 'Últimos eventos: rollbacks da API e alertas (lock longo, transação parada, deadlock, break-glass)' })
  events(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.monitor.recentEvents(Math.min(Math.max(limit, 1), 200));
  }

  // SSE: cada evento novo chega na hora (LISTEN/NOTIFY); o ping a cada 15 s mantém a conexão viva em proxies
  @Sse('stream')
  @RequirePermission('monitor:read')
  @ApiOperation({ summary: 'Fluxo ao vivo dos eventos do monitor (text/event-stream)' })
  stream(): Observable<MessageEvent> {
    return merge(
      this.monitor.events$.pipe(map((e) => ({ id: String(e.id), type: e.kind, data: e }))),
      interval(15_000).pipe(map(() => ({ type: 'ping', data: {} }))),
    );
  }

  @Get('series')
  @RequirePermission('monitor:read')
  @ApiOperation({ summary: 'Commits, rollbacks, deadlocks e cache hit por intervalo (LAG entre amostras)' })
  series(@Query('minutes', new DefaultValuePipe(30), ParseIntPipe) minutes: number) {
    return this.monitor.series(Math.min(Math.max(minutes, 1), 1440));
  }
}
