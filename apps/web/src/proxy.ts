import { NextResponse, type NextRequest } from 'next/server';

// Layouts do Next não recebem a URL; o proxy repassa o caminho para o login voltar ao lugar certo
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-dbwatch-path', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
