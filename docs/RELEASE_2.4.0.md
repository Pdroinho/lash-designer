# Lash Designer 2.4.0 — Responsive & Visual Consolidation

## Objetivo

Consolidar o produto visualmente e estruturalmente depois de várias gerações de CSS. O foco é responsividade real, largura/scroll corretos, sidebar, Agenda, overlays, mobile e consistência das experiências externas.

## Principais mudanças

- shell e sidebar reconstruídos;
- drawer mobile independente;
- sistema de scrollbars da marca;
- contrato único de overlays via portal no `body`;
- Product Tour integrado ao coordenador de overlays;
- Agenda adaptativa por largura real do contêiner;
- Serviços em cards no mobile;
- dashboard e banners compactados/humanizados;
- billing e checkout responsivos;
- landing comercial atualizada com quatro ciclos visíveis e CTA direto;
- login e setup pós-compra refinados;
- Luma unificada e OpenRouter preservado no servidor;
- uploads com validação binária e limites antes/depois do processamento;
- domínio e WhatsApp simplificados para a profissional;
- sistema de indicações preservado.

## QA

- 95 cenários consolidados em Chromium, zero falhas estruturais;
- zoom equivalente: 80%, 90%, 100%, 110%, 125% e 150%;
- viewports entre 320×568 e 1920×1080;
- overlays, sidebar, Agenda, landing, billing, setup, Luma, login, checkout, serviços, financeiro, WhatsApp, portal da cliente e DEV dark incluídos.

Consulte `VISUAL_QA_MATRIX_2.4.md` para a matriz completa.

## Build

O build/typecheck integral não foi validado neste ambiente porque `npm ci` falha no registry interno ao buscar `zod-validation-error@4.0.2`. O erro ocorre antes de instalar Vite e suas definições, portanto `npm run check` para em `vite/client`. Isso é documentado como gate externo, não como sucesso.

## Homologação externa obrigatória

- `npm ci && npm run check && npm run preflight` em registry npm funcional;
- InfinitePay real (Pix/cartão/webhook/retorno);
- OpenRouter real;
- DNS/Caddy e domínio personalizado;
- QR/estado real do WhatsApp;
- Firefox e Safari/WebKit;
- dispositivos físicos e teclado virtual.
