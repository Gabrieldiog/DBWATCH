import { Controller, Get, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly db: PrismaService) {}

  // Rota pública: não expõe versão do PostgreSQL nem detalhes do erro
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    try {
      const latencyMs = await this.db.ping();
      return { status: 'ok', database: { status: 'up', latencyMs } };
    } catch (err) {
      this.logger.warn(`Banco indisponível: ${err instanceof Error ? err.message : String(err)}`);
      res.status(503);
      return { status: 'degraded', database: { status: 'down' } };
    }
  }
}
