# Branding e configuração de domínio

A marca provisória do produto é **Lash Designer**. O domínio público não é fixo no código: ele é definido por `APP_BASE_URL` e exposto ao frontend por `VITE_APP_BASE_URL`.

## Variantes de endereço

- plataforma: hostname de `APP_BASE_URL`;
- console DEV: `DEV_HOST` / `VITE_DEV_HOST`;
- espaços: `[slug].<hostname-da-plataforma>`;
- domínios próprios: cadastrados e verificados no painel ADMIN.

## Sistema visual atual — 3.3 (produto)

- direção: **Quiet Beauty Utility** — beauty-tech refinado, calmo e operacional;
- base clara: marfim quente, papel e superfícies brancas;
- accent: vinho/rosé como pontuação;
- base escura: carvão quente, sem azul-marinho;
- texto: grafite no claro e marfim no escuro;
- interface: Manrope;
- títulos editoriais seletivos: Fraunces;
- iconografia: Phosphor Icons por mapa semântico;
- tenant pode alterar accent e logo sem recolorir semântica/neutros.

Contrato completo: `docs/DESIGN_SYSTEM_3.3.md`. A Landing Page está fora desse sistema até o redesign comercial completo.

A direção final e os arquivos a substituir estão em `docs/ASSETS_NEEDED.md`. Não publique campanhas com o favicon `LD` ou as imagens provisórias sem revisão de licença e direção de arte.
