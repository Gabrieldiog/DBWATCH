# Deploy

Como o DBWATCH roda na VPS: três contêineres (`db`, `api`, `web`) numa rede própria do Docker Compose, em `/opt/dbwatch`. Só o `web` publica porta (`WEB_PORT`, 8088 por padrão); o PostgreSQL e a API ficam na rede interna. O endereço é `http://IP-DA-VPS:8088`, sem domínio.

> **HTTPS:** sem domínio não há certificado, então o cookie de sessão viaja sem `Secure` (o login funciona em `http://IP:porta`) e a API avisa isso no log. Com domínio e HTTPS na frente, basta trocar `APP_ORIGIN` para `https://...`.
>
> **A VPS é compartilhada** com outro sistema em produção. O DBWATCH não mexe em nada dele: usa pasta, rede, volume e porta próprios, e cada contêiner tem limite de memória (db 384 MB, api 384 MB, web 256 MB) e de CPU (0,5 núcleo cada); rode os comandos pesados com `nice -n 19`.

## Peças

| Arquivo | Para quê |
| --- | --- |
| `apps/api/Dockerfile` | Alvos `runtime` (API enxuta, usuário `node`) e `tools` (migrations, banco-alvo e seed) |
| `apps/web/Dockerfile` | Next em modo `standalone`, usuário `node` |
| `docker-compose.prod.yml` | `db`, `api`, `web` e o `tools` (perfil `tools`, só sob demanda) |
| `.env.prod.example` | Modelo do `.env` do servidor, sem segredo |
| `infra/deploy/backup.sh` | `pg_dump -Fc` diário com retenção de 7 dias |

O `API_INTERNAL_URL` do web é gravado **na hora do build** (o Next fixa o destino do repasse de `/api/*`), por isso o Dockerfile do web recebe o argumento. A API roda com `TRUST_PROXY=uniquelocal` para enxergar o IP real do cliente que o Next repassa; a auditoria e o limite de login dependem disso.

## 1. Primeiro deploy

Se a VPS for `amd64` e o seu computador `arm64`, construa para a arquitetura da VPS e mande as imagens prontas (não pesa no servidor):

```bash
export DBWATCH_TAG=$(date +%Y%m%d-%H%M)   # a etiqueta serve para o rollback
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -f docker-compose.prod.yml --env-file .env.prod.local build api web
docker buildx build --platform linux/amd64 --target tools -f apps/api/Dockerfile -t dbwatch-tools:$DBWATCH_TAG --load .   # o compose reaproveitou a imagem arm64 no alvo tools
for i in api web tools; do docker save dbwatch-$i:$DBWATCH_TAG; done | gzip | ssh root@IP-DA-VPS 'gunzip | docker load'
```

No servidor:

1. **Pasta e arquivos** (só o necessário, nada de `git clone` com o histórico):
   ```bash
   mkdir -p /opt/dbwatch/backups && cd /opt/dbwatch
   # do seu computador, na raiz do repositório:
   git archive HEAD docker-compose.prod.yml infra/postgres/init infra/deploy | ssh root@IP-DA-VPS 'tar -x -C /opt/dbwatch'
   ```
2. **`.env`**: copie `.env.prod.example` para `/opt/dbwatch/.env`, troque cada `TROQUE` por `openssl rand -hex 24` (uma senha diferente por papel e as mesmas repetidas nas URLs), ajuste `APP_ORIGIN` e `DBWATCH_TAG`, e então `chmod 600 .env`.
3. **Firewall:** `ufw status numbered > /root/backup-ufw-$(date +%F).txt` e depois `ufw allow 8088/tcp`.
4. **Banco, migrations, banco-alvo e seed:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --wait db
   docker compose -f docker-compose.prod.yml run --rm tools pnpm db:migrate
   docker compose -f docker-compose.prod.yml run --rm tools pnpm db:target
   docker compose -f docker-compose.prod.yml run --rm tools pnpm db:seed --permitir-producao
   ```
   O seed imprime as senhas dos cinco usuários demo **uma única vez**, só no terminal. Guarde num gerenciador de senhas; nada disso vai para arquivo nem para o repositório.
5. **Sobe tudo:** `docker compose -f docker-compose.prod.yml up -d --no-build --wait`
6. **Backup diário** (cron do root): `30 3 * * * /opt/dbwatch/infra/deploy/backup.sh >> /opt/dbwatch/backups/backup.log 2>&1`

### Conferência

- `curl -s http://IP-DA-VPS:8088/api/health` responde `{"status":"ok",...}`.
- No navegador, o login abre, um usuário demo entra, o Monitor mostra amostras e um experimento do Laboratório roda.
- `ss -tlnp | grep 5432` não mostra nada: o banco não tem porta no host.
- O outro sistema da VPS responde como antes.

## 2. Atualizar

1. Rode o backup na hora: `/opt/dbwatch/infra/deploy/backup.sh`.
2. Construa e envie as imagens com uma etiqueta nova (passo "Primeiro deploy"); copie o compose de novo se ele mudou.
3. No `.env`, troque `DBWATCH_TAG` pela etiqueta nova (guarde a anterior).
4. Migrations (se houver): `docker compose -f docker-compose.prod.yml run --rm tools pnpm db:migrate`.
5. `docker compose -f docker-compose.prod.yml up -d --no-build --wait`.
6. Repita a conferência.

**Uma vez só, na atualização que traz o console SQL (PK-21):** os papéis de escrita do banco-alvo são criados pelo superusuário, antes do `db:target` (que dá a eles as permissões nas tabelas da loja). O script é idempotente:

```bash
git archive HEAD infra/postgres/init infra/target | ssh root@IP-DA-VPS 'tar -x -C /opt/dbwatch'   # do seu computador
docker compose -f docker-compose.prod.yml exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d dbwatch < infra/postgres/init/02-papeis-escrita.sql
docker compose -f docker-compose.prod.yml run --rm tools pnpm db:target
```

Não rode o seed numa atualização: ele gera senhas novas e revoga as sessões dos usuários demo.

## 3. Rollback

**Só o código** (migration não mudou o banco, ou ela é compatível com a versão anterior): volte `DBWATCH_TAG` no `.env` para a etiqueta anterior e rode `up -d --no-build --wait`. As imagens antigas continuam no servidor até você apagá-las.

**Código e banco** (a migration não é compatível): volte a etiqueta e restaure o backup feito no passo 1 da atualização (abaixo).

## 4. Restaurar um backup

Os dumps ficam em `/opt/dbwatch/backups/dbwatch-AAAAMMDD-HHMMSS.dump` (formato custom, 7 dias).

**Conferir sem risco** (restaura num banco ao lado, que não afeta o que está no ar):

```bash
cd /opt/dbwatch
F=backups/dbwatch-AAAAMMDD-HHMMSS.dump
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -c 'create database dbwatch_restore'
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U postgres -d dbwatch_restore < $F
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d dbwatch_restore -c 'select count(*) from iam.users'
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -c 'drop database dbwatch_restore'
```

**Substituir o banco em uso** (perde o que foi gravado depois do dump):

```bash
docker compose -f docker-compose.prod.yml stop api web
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -c 'drop database dbwatch' -c 'create database dbwatch owner dbwatch_migrator'
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U postgres -d dbwatch < $F
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d dbwatch -c 'revoke all on database dbwatch from public' -c 'grant connect on database dbwatch to dbwatch_app, dbwatch_monitor, dbwatch_lab'
docker compose -f docker-compose.prod.yml up -d --no-build --wait
```

Se o banco em uso for apagado por engano, o mesmo roteiro serve. O `dbwatch_target` (dados fictícios das consultas) não entra no backup: refaça com `pnpm db:target`.

## 5. Desligar o DBWATCH

`docker compose -f docker-compose.prod.yml down` para os contêineres e preserva o volume `pgdata`. Só `down -v` apaga o banco; faça um backup antes.
