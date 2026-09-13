# Release 2.3.1 — Conversion & Reliability Polish

## Resultado

A revisão transforma a landing em uma página comercial mais direta e corrige os regressos operacionais observados nas capturas da 2.3.0. O motor de indicações foi preservado sem alterações funcionais.

## Landing e compra

- header em duas camadas, com oferta anual compacta e ações de entrar/comprar claramente separadas;
- hero com promessa curta orientada a resultado e captura/loop do produto;
- escala tipográfica reduzida para evitar títulos de quatro ou cinco linhas;
- quatro ciclos exibidos na página, com equivalente mensal, total cobrado e economia;
- área de cenários ilustrativos mantida com disclosure; nenhum depoimento é apresentado como real;
- acesso ao espaço redesenhado com composição editorial, sufixo do domínio e formulário móvel dedicado.

## Produto

- overlays passam a cobrir o viewport por `inset`, sem depender de `100vw` no zoom;
- scrollbar estável no documento e nos diálogos evita deslocamento enquanto o formulário muda;
- sidebar recolhida tem largura/base de 82 px, labels removidos do fluxo e toggle fora da marca;
- prefixo de domínio não encolhe nem sobrepõe o campo;
- banner do dashboard usa máscara gradual sobre uma única superfície;
- ícone quebrado do Product Tour foi substituído por Phosphor Compass.

## Uploads e setup

- decoder tenta `createImageBitmap` e possui fallback independente por `Image`/object URL;
- PNG, JPEG e WebP são redimensionados em tentativas progressivas;
- limites binários consideram o crescimento do base64 antes da validação no servidor;
- o primeiro Continuar do setup não consulta IA;
- desktop baixo e mobile têm contratos específicos, sem a borda branca intensa.

## Luma e OpenRouter

- conversa e visão usam `/api/v1/chat/completions` via OpenRouter;
- padrão interativo: `openai/gpt-5-nano`;
- `openai/gpt-5-nano:batch` fica configurado apenas para futuras tarefas assíncronas;
- launcher discreto, drawer lateral, chips de sugestão, Enter para enviar, Shift+Enter para quebrar linha e rolagem automática;
- indisponibilidade da IA não bloqueia o produto nem o setup manual.

## WhatsApp

A cliente vê somente estado, QR Code e preferências de mensagens. URL, API key e provisionamento Evolution ficam sob responsabilidade do DEV; quando as credenciais globais existem, a instância do tenant é preparada automaticamente.

## Validação

Execute `npm run check`. A publicação ainda exige a matriz manual externa nos navegadores/dispositivos definidos em `docs/RELEASE_CHECKLIST.md`, além de checkout, DNS, Evolution e OpenRouter reais.
