# Release 2.2.0 — Conversion, Luma & Referral Engine

## Experiência e responsividade

- overlay modal isolado do `content-max`, com `100dvw × 100dvh`, safe areas e bottom sheet móvel;
- faixa lateral eliminada ao remover `scrollbar-gutter: stable` do diálogo;
- inputs, rodapés, grids e larguras normalizados em todas as superfícies modais;
- banners de billing, dashboard e Luma ficaram mais compactos e orientados a ação;
- assets editoriais próprios integrados à Luma, dashboard e fundos de dados.

## Landing page e compra

- hero, argumentos, benefícios, pricing e CTA reescritos para comunicar resultado e reduzir fricção;
- seção dedicada à Luma com limites de privacidade claros;
- cadastro, escolha de ciclo e checkout InfinitePay iniciados diretamente na landing;
- preço e descontos recalculados no servidor;
- galeria de prova social marcada como demonstração até existir autorização e evidência real.

## Luma

- botão flutuante disponível no painel ADMIN;
- conversa em drawer acessível, subordinada ao mesmo coordenador de overlays;
- preservados assinatura ativa, limite diário, chave somente no servidor e contexto agregado.

## Indicações

- painel ADMIN para criar/copiar link e acompanhar conversões/créditos;
- painel DEV com overview, criação, revogação e campanhas de 0% a 100%;
- proteção de links de 100%, bloqueio de autoindicação, limites por renovação e estados auditáveis;
- ativação gratuita segura e pagamento comum idempotente por webhook.

## Validação

- typecheck, lint, testes unitários, auditorias responsiva/iconográfica/visual/UX/indicações e build de produção;
- matriz visual manual em Chromium 149 nos viewports 1440 × 900, 1024 × 768, 390 × 844 e 320 × 700;
- correções de renderização encontradas na compra direta, launcher/drawer da Luma e modal de Agenda registradas em `docs/VISUAL_QA_MATRIX_2.2.md`;
- novas regressões cobertas por `server/referrals.test.ts` e `scripts/referral-audit.mjs`.
- lockfile atualizado após auditoria de dependências; a exceção arquitetural temporária do React Router/RSC está documentada em `docs/SECURITY.md`.
