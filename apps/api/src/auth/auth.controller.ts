import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RateLimiter } from '../common/security';
import type { Env } from '../config/env';
import { ENV } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { ABSOLUTE_TIMEOUT_MS, loginSchema, sessionCookieName } from './credentials';
import { Public } from './public.decorator';
import { currentUser } from './session.guard';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly limiter: RateLimiter;
  private readonly cookie: string;
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) env: Env,
  ) {
    this.limiter = new RateLimiter(env.LOGIN_RATE_LIMIT, 60_000);
    this.production = env.NODE_ENV === 'production';
    this.cookie = sessionCookieName(this.production);
  }

  @Public()
  @Post('login')
  @HttpCode(204)
  @ApiOperation({ summary: 'Entra no sistema e recebe o cookie de sessão (HttpOnly)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: { email: { type: 'string', example: 'diego.solicitante@dbwatch.test' }, password: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 204, description: 'Sessão criada' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas (mesma resposta para usuário inexistente)' })
  @ApiResponse({ status: 423, description: 'Conta bloqueada após 5 falhas seguidas' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas deste IP' })
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    // Tentativas barradas aqui não vão para a auditoria: um ataque em massa a travaria
    if (!this.limiter.allow(req.ip ?? 'desconhecido')) {
      this.logger.warn(`Limite de tentativas de login atingido para ${req.ip}`);
      throw new HttpException('Muitas tentativas. Aguarde um minuto.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Informe e-mail e senha válidos');
    const token = await this.auth.login(parsed.data, { ip: req.ip, userAgent: req.header('user-agent') });
    res.cookie(this.cookie, token, {
      httpOnly: true,
      secure: this.production,
      sameSite: 'strict',
      path: '/',
      maxAge: ABSOLUTE_TIMEOUT_MS,
    });
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoga a sessão atual no banco e apaga o cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(currentUser(req).sessionId);
    res.clearCookie(this.cookie, { path: '/', httpOnly: true, secure: this.production, sameSite: 'strict' });
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Usuário da sessão, com papéis e permissões efetivas' })
  async me(@Req() req: Request) {
    const user = currentUser(req);
    return { id: user.id, email: user.email, displayName: user.displayName, ...(await this.auth.profile(user.id)) };
  }
}
