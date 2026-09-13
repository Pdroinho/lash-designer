# Escopo comercial recomendado para o lançamento

## Oferta base

- Agenda online por espaço/tenant.
- Link público em subdomínio oficial.
- Domínio personalizado verificado, com HTTPS automático.
- Catálogo de serviços, horários, bloqueios e gestão de clientes.
- Dashboard, financeiro básico e portal da cliente.
- Plano anual com checkout InfinitePay.

## Funcionalidades que exigem validação operacional antes de anunciar

- Lembretes e campanhas de WhatsApp: dependem da Evolution API, consentimento das clientes e teste com o provedor real.
- Domínios personalizados: anuncie após validar DNS e emissão TLS em pelo menos dois provedores de domínio.
- Restauração de desastre: anuncie SLA somente após um teste real de restauração em ambiente separado.
- PWA/ícones, identidade final e compartilhamento social: dependem dos assets listados em `docs/ASSETS_NEEDED.md`.

## Não prometer nesta versão

- Aplicativo nativo em lojas.
- IA.
- Equipes, permissões granulares e comissões.
- Integração contábil/fiscal.
- Alta disponibilidade multi-instância com SQLite.
- Cobrança automática recorrente sem interação, caso o fluxo contratado na InfinitePay não ofereça essa modalidade.

## Critério de lançamento

Use o checklist de `DEPLOY_VPS.md`, preencha `docs/LAUNCH_INPUTS.md`, substitua os assets P0 e execute todos os comandos de `VALIDATION.md` no ambiente final.
