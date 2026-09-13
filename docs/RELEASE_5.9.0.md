# Lash Designer 5.9.0 — Tenant Theme Coherence

## Objetivo

Corrigir a personalização visual do espaço como sistema, não como acento isolado. Uma cor escolhida pelo tenant agora governa também superfícies sutis, dashboard, booking e o setup.

## Mudanças

- `applyTenantTheme` passa a derivar superfícies claras, bordas e tokens do Product Design System a partir da cor principal.
- `gray-50` legado acompanha a superfície temática para telas ainda não totalmente migradas.
- Dashboard hero deixa o vinho hardcoded e deriva gradiente/overlay da paleta do tenant.
- Foto do hero recebe blend ampliado para eliminar a divisão visual seca entre cor e imagem.
- Sidebar usa logo e nome do espaço quando configurados.
- Salvar identidade atualiza a marca do shell imediatamente, sem depender de refetch por slug.
- Setup usa a paleta escolhida ao vivo no rail e nos controles.
- Inputs do setup foram normalizados; removido `min-height: 76px` aplicado indevidamente a campos comuns.
- Passo de serviços não depende mais de overflow horizontal e usa grid flexível.
- Booking público consome superfícies do tenant e remove acentos rosa hardcoded de hover/focus/scrollbar/shadows.
- Contador `1/4` isolado é removido no desktop; o stepper passa a carregar a progressão. No mobile permanece um contador compacto.

## Fora de escopo

- nenhuma migration;
- nenhuma mudança de API;
- nenhuma mudança de billing, segurança, campanhas ou consentimento;
- nenhuma alteração da landing 5.8.

## Validação

- Theme 5.9: 20/20
- Responsividade: 26/26
- Visual System: 22/22
- Onboarding: 16/16
- Product Consistency: 19/19
- Security: 43/43
- Suites independentes: 60/60

`typecheck` integral continua bloqueado nesta sessão por ausência de `vite/client`/`node_modules`.
