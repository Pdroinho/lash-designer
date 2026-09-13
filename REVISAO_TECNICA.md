# Revisão técnica consolidada — Lash Designer 1.1.0

## Riscos críticos tratados

- isolamento de tenant por hostname e sessão;
- domínio personalizado sem prova de propriedade;
- autorização indevida de certificado para host não cadastrado;
- login rápido e pagamento simulado disponíveis em produção;
- webhook de pagamento sem ativação transacional completa;
- renovação anual perdendo dias já pagos;
- cópia/restauração direta de SQLite aberto;
- migração de usuários com foreign keys desligadas no momento incorreto;
- endpoint financeiro que não respondia;
- URLs e domínios de produção fixos ou inconsistentes.

## Arquitetura atual

- React + Vite + TypeScript no frontend.
- Express + TypeScript no backend.
- SQLite/better-sqlite3 em instância única.
- JWT em cookie seguro.
- Caddy para proxy, HTTPS normal da plataforma e HTTPS sob demanda autorizado para hosts dinâmicos.
- systemd para supervisão, timer de backup e scripts de recuperação.

## Limites conhecidos

- SQLite não deve ser compartilhado por múltiplas instâncias simultâneas.
- Rate limit é mantido em memória e reinicia com o processo; para escala horizontal, mover para Redis ou serviço equivalente.
- O módulo Evolution/WhatsApp depende de API externa e precisa de teste contratual/operacional; automações e campanhas em massa permanecem bloqueadas até existir consentimento, opt-out, fila e observabilidade.
- O produto ainda precisa de assets finais, conteúdo jurídico, contatos e credenciais reais.
- Sem uma instalação limpa das dependências neste ambiente, não é correto declarar o bundle final como compilado; veja `VALIDATION.md`.

## Recomendação

Publicar primeiro em staging com um domínio real, banco novo e dados fictícios. Executar fluxo completo de cadastro, agenda, conflito, bloqueio, cliente, checkout, webhook, domínio personalizado, backup e restauração. Somente depois promover o mesmo artefato e configuração revisada para produção.
