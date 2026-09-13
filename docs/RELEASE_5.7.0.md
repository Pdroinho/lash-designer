# Lash Designer 5.7.0 — Asset Refresh

## Objetivo

Eliminar a divergência entre a plataforma atual e os screenshots/vídeos usados na landing, além de retirar assets legados sem uso.

## Causa raiz

Os screenshots de produto tinham sido gerados antes das últimas camadas do design system. O fixture de captura também não reproduzia a mesma cascata de CSS carregada por `src/main.tsx`: havia CSS antigo da Luma e faltavam camadas atuais de WhatsApp, Financeiro, Booking e lifecycle. Isso fazia tipografia, espaçamento e componentes divergirem mesmo quando a aplicação real já havia evoluído.

A fonte canônica da aplicação é Manrope. O ambiente desta geração não possui Manrope instalada e não consegue acessar Google Fonts, então o preview gerado aqui usa o fallback Inter. Para impedir que isso volte a passar despercebido, o pipeline agora suporta `ASSET_CAPTURE_STRICT_FONT=1` e `ASSET_CAPTURE_MANROPE_FILE=/caminho/Manrope.ttf`; no modo estrito a captura falha sem a fonte exata. Nenhum arquivo de fonte é distribuído no release.

## Assets regenerados

- Dashboard desktop e mobile com dados demo consistentes;
- Agenda semanal populada;
- Luma com a estrutura atual `luma34/luma35`;
- WhatsApp Center com a interface 3.9 e conversa plausível;
- Financeiro com dados e gráfico preenchidos;
- Booking mobile com imagens reais dos serviços, sem placeholders cinza;
- `product-flow.mp4` e `.webm` refeitos em 1280×800;
- `og-cover.jpg` reconstruído em 1200×630 com produto atual;
- manifests de assets atualizados.

## Pipeline

`scripts/asset-refresh-v57.py` usa a mesma ordem de CSS da aplicação, inlining de assets locais e captura determinística via Chromium. `scripts/asset-refresh-v57-audit.mjs` protege os contratos do catálogo.

## Limpeza

Assets antigos sem referência no runtime foram removidos. O fallback `result-640.webp` foi mantido porque ainda é usado pelo booking quando um serviço não possui imagem.
