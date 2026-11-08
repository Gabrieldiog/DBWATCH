// Textos de ajuda das telas: o que cada área é, para que serve e quem usa. Puro, para o teste conferir a cobertura

// Cada área do menu (mesmos hrefs do NAV), dita para quem nunca viu um PAM
export const GUIA: Record<string, { oque: string; serve: string }> = {
  '/monitor': {
    oque: 'Um painel do próprio PostgreSQL: conexões, esperas por lock, deadlocks, commits e rollbacks, lidos a cada 5 s.',
    serve: 'Ver na hora quando o banco trava, quem está bloqueando quem e o que a aplicação desfez.',
  },
  '/laboratorio': {
    oque: 'Experimentos de concorrência com duas sessões reais do banco, num schema separado (LAB).',
    serve: 'Provar ao vivo rollback, espera de lock, deadlock, níveis de isolamento e índices.',
  },
  '/sessoes': {
    oque: 'Os aparelhos onde a sua conta está aberta agora.',
    serve: 'Encerrar um computador esquecido logado: a sessão é revogada no banco na hora.',
  },
  '/pedidos': {
    oque: 'O pedido de acesso temporário a um recurso, com justificativa.',
    serve: 'Ninguém tem acesso fixo aos dados: quem precisa pede, e outra pessoa decide.',
  },
  '/aprovacoes': {
    oque: 'A fila de pedidos esperando decisão e os acessos de emergência para revisar.',
    serve: 'Separação de funções: quem pede nunca é quem aprova, e o banco garante isso.',
  },
  '/acessos': {
    oque: 'Os acessos que você recebeu, com a contagem regressiva até vencer.',
    serve: 'O acesso some sozinho no fim do prazo, pelo relógio do banco; quem aprova pode revogar antes.',
  },
  '/consultas': {
    oque: 'As consultas prontas sobre os dados da loja fictícia, só leitura e com tempo-limite.',
    serve: 'Usar o acesso aprovado sem SQL livre: quem aprova sabe exatamente o que pode ser feito.',
  },
  '/console': {
    oque: 'Um campo para escrever SQL de verdade no banco da loja, com um acesso de Escrita aprovado.',
    serve: 'Corrigir um dado sem dar a ninguém acesso fixo ao banco: o papel do banco limita a tabela, e o comando inteiro vai para a auditoria.',
  },
  '/auditoria': {
    oque: 'A trilha de tudo o que aconteceu: quem, o quê, quando e o resultado.',
    serve: 'Responder "quem viu o dado X e com a aprovação de quem". Ninguém apaga nem altera, e a cadeia de hash prova isso.',
  },
  '/usuarios': {
    oque: 'Pessoas, papéis e regras de login por IP e horário.',
    serve: 'Dar a cada pessoa só o papel de que ela precisa, e barrar login fora do lugar ou do horário.',
  },
};

export const PAPEIS: [string, string][] = [
  ['Administração', 'Cuida das pessoas e dos papéis, roda o Laboratório e o Monitor e pode abrir acesso de emergência. Não aprova pedidos nem lê a auditoria.'],
  ['Aprovação', 'Aprova, rejeita e revoga acessos de outras pessoas e acompanha o Monitor. Também pode pedir e consultar.'],
  ['Solicitante', 'Pede acesso e usa as consultas enquanto o acesso estiver vivo.'],
  ['Auditoria', 'Lê a trilha, verifica a cadeia de hash e acompanha o Monitor. Não mexe em nada.'],
];

// Cada permissão do banco (iam.permissions) em uma frase; o teste falha se aparecer uma permissão sem texto
export const PERMISSAO: Record<string, string> = {
  'request:create': 'Pedir acesso a um recurso',
  'request:read:own': 'Ver os próprios pedidos',
  'request:review': 'Aprovar ou rejeitar pedidos de outras pessoas',
  'grant:read:own': 'Ver os próprios acessos',
  'grant:revoke': 'Revogar um acesso antes do prazo',
  'query:execute': 'Executar consultas do catálogo (com acesso vivo)',
  'breakglass:use': 'Abrir acesso de emergência sem aprovação prévia',
  'audit:read': 'Ler a trilha de auditoria',
  'audit:verify': 'Verificar a integridade da cadeia de hash',
  'monitor:read': 'Ver o Monitor do banco',
  'lab:run': 'Rodar os experimentos do Laboratório',
  'user:manage': 'Criar, ativar e desativar pessoas',
  'role:assign': 'Dar e tirar papéis (nunca a si mesmo)',
};
