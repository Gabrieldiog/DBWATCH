import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getCorrelationId } from './correlation-id';

const INTERNAL_MESSAGE = 'Erro interno. Informe o código de suporte.';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const correlationId = getCorrelationId(req);
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      // req.path em vez de req.url: a query string pode carregar dados sensíveis
      this.logger.error(
        { correlationId, method: req.method, path: req.path, error: describe(exception) },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      statusCode: status,
      message: status >= 500 ? INTERNAL_MESSAGE : publicMessage(exception),
      correlationId,
    });
  }
}

function publicMessage(exception: unknown): string | string[] {
  if (!(exception instanceof HttpException)) return 'Requisição inválida';
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' || Array.isArray(message) ? message : exception.message;
}

function describe(exception: unknown): string {
  return exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception);
}
