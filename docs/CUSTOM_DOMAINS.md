# Domínios personalizados

## O que foi implementado

Cada espaço pode cadastrar até **5 hostnames**, por exemplo `agenda.studio.com.br`. O sistema não aceita URL completa, porta, IP, wildcard, localhost, domínio oficial da plataforma nem sufixos reservados.

Fluxo:

1. a administradora cadastra o hostname;
2. a API normaliza IDN para ASCII, cria token criptograficamente aleatório e grava `PENDING`;
3. a interface informa um TXT de propriedade e um CNAME ou A/AAAA de roteamento;
4. a API consulta DNS público;
5. somente TXT e roteamento corretos mudam o domínio para `ACTIVE`;
6. o Caddy consulta o endpoint local de autorização antes de emitir HTTPS sob demanda;
7. a aplicação resolve o hostname somente para o tenant ativo correspondente;
8. o domínio ativo marcado como principal passa a ser usado no link de agendamento e na URL canônica pública.

## Registros apresentados à cliente

Propriedade:

```text
Tipo: TXT
Nome: _lashdesigner-verification.agenda.studio.com.br
Valor: lashdesigner=<token-aleatorio>
```

Roteamento recomendado:

```text
Tipo: CNAME
Nome: agenda
Destino: valor de CUSTOM_DOMAIN_CNAME_TARGET
```

Para domínio raiz, use ALIAS/ANAME/CNAME flattening do provedor ou configure A/AAAA com os IPs publicados pela plataforma.

## Segurança

- CNAME/A/AAAA isoladamente não provam propriedade; o TXT é obrigatório.
- O endpoint `/api/internal/domains/authorize` só aceita conexão loopback e `DOMAIN_AUTH_SECRET` com comparação constante.
- A consulta de autorização usa índice e retorna `204` somente para plataforma, DEV, subdomínio oficial válido ou domínio personalizado `ACTIVE`.
- Tenant suspenso, domínio removido ou domínio com DNS inválido não resolve uma conta.
- Domínios ativos são revalidados; ausência autoritativa de propriedade/roteamento muda o status para `ERROR` e revoga novas autorizações TLS. Timeouts, `SERVFAIL` e indisponibilidade transitória do resolvedor preservam o status atual e registram o erro para nova tentativa.
- HSTS não usa `includeSubDomains`, porque os domínios das clientes não pertencem à plataforma.

## HTTPS no Caddy

O domínio principal usa HTTPS automático normal. O bloco dinâmico usa `tls { on_demand }`; antes de emitir um certificado, o Caddy chama o endpoint `ask`. Não é necessário certificado wildcard para os subdomínios dos tenants.

O segredo do `ask` aparece na configuração local do Caddy, no caminho da chamada loopback e no `.env`; gere-o em hexadecimal, proteja esses arquivos para root/usuário do serviço e não habilite access log detalhado para a rota interna.

## Variáveis

```env
CUSTOM_DOMAIN_CNAME_TARGET=domains.app.suamarca.com.br
CUSTOM_DOMAIN_IPV4=
CUSTOM_DOMAIN_IPV6=
DOMAIN_AUTH_SECRET=<segredo-aleatorio-separado>
DOMAIN_VERIFY_INTERVAL_MINUTES=10
DOMAIN_ACTIVE_REVERIFY_HOURS=24
```

Ao menos um destino de roteamento é obrigatório em produção. Quando usar múltiplos IPs, separe por vírgula.

## Operação e teste

Durante a ativação, deixe o registro sem proxy/CDN. Propagação pode levar minutos ou horas.

```bash
dig TXT _lashdesigner-verification.agenda.cliente.com.br
dig CNAME agenda.cliente.com.br
dig A agenda.cliente.com.br
dig AAAA agenda.cliente.com.br
curl -i 'http://127.0.0.1:3000/api/internal/domains/authorize/SEGREDO?domain=agenda.cliente.com.br'
curl -Iv https://agenda.cliente.com.br
```

O endpoint local retorna `204 No Content` somente após a ativação. Teste pelo menos:

- subdomínio com CNAME;
- domínio raiz com A/AAAA ou flattening;
- TXT incorreto;
- roteamento incorreto;
- remoção de domínio;
- tenant suspenso;
- troca de domínio principal;
- primeira emissão e renovação TLS.

## Observação sobre disponibilidade

Domínios ativos são revalidados por segurança. Falhas transitórias do resolvedor não desativam um domínio já ativo; a remoção autoritativa dos registros TXT ou de roteamento, porém, muda o status para `ERROR`. Mantenha o subdomínio oficial do tenant como rota de contingência e monitore erros de verificação.
