# Assets finais necessários

## Resumo por prioridade

| Prioridade | Entrega | Bloqueia campanha? |
|---|---|---|
| P0 | logotipo, favicon/ícones PWA, imagem do login, hero do agendamento | Sim |
| P1 | capa Open Graph, capas padrão de serviços, placeholders de tenant/avatar | Recomendado antes de tráfego pago |
| P2 | ilustrações de estados vazios e screenshots de ajuda/onboarding | Pode entrar após o lançamento técnico |

O código inclui placeholders funcionais, mas eles não representam uma identidade final. A imagem atual de login tem **1920×3000 px** e funciona como provisória. A imagem atual de agendamento também tem **1920×3000 px**, formato vertical inadequado para o hero horizontal; substitua esta antes da campanha pública.

## Direção visual mestre

**Conceito:** beauty SaaS premium, acolhedor e profissional — editorial contemporâneo, não “salão genérico”.

**Paleta sugerida:** marfim quente, rosé queimado, vinho profundo, grafite e pequenos acentos champanhe fosco. Evitar rosa neon, glitter, excesso de dourado, fundos poluídos e texto gerado dentro de imagens.

**Fotografia:** luz difusa de estúdio, pele realista, cílios tecnicamente plausíveis, enquadramentos limpos e bastante espaço negativo. Representar diferentes tons de pele. Não mostrar menores, marcas de terceiros, instrumentos em posição insegura ou resultados exagerados.

**Prompt-base para consistência:**

> Direção de arte editorial premium para uma plataforma SaaS brasileira de lash designers, estética minimalista e sofisticada, paleta marfim quente, rosé queimado, vinho profundo e grafite, iluminação de estúdio suave e difusa, textura natural de pele, composição limpa com espaço negativo, luxo discreto, fotografia comercial realista, sem texto, sem logotipo, sem glitter, sem rosa neon, sem aparência de banco de imagens barato.

**Negative prompt comum:**

> texto, letras, watermark, logotipo de terceiros, glitter, rosa neon, dourado espelhado, pele plástica, cílios impossíveis, olhos deformados, mãos extras, pinças atravessando a pele, procedimento inseguro, menor de idade, ambiente desorganizado, baixa resolução, excesso de retoque, estética genérica de banco de imagens.

## P0.1 — Sistema de logotipo

**Uso:** login, sidebar, favicon, site, documentos e comunicação.

**Entregas:**

- `logo-horizontal-dark.svg` — para fundo claro;
- `logo-horizontal-light.svg` — para fundo escuro;
- `logo-symbol.svg` — símbolo isolado;
- `logo-one-color.svg` — uma cor;
- PDF vetorial e PNG transparente com 2000 px.

**Requisitos:** símbolo legível a 16 px; wordmark sem fios excessivamente finos; versão negativa; área de proteção e tamanho mínimo documentados; SVG sem fonte externa, script ou raster embutido.

**Prompt de exploração:**

> Crie um sistema de identidade visual vetorial para “Lash Designer”, software premium de agenda e gestão para profissionais de cílios. Símbolo abstrato combinando delicadamente curva de cílio, calendário e centelha, geometria simples, memorável em 16 px, wordmark elegante porém altamente legível, luxo discreto, sem olho literal detalhado, sem coroa, sem monograma genérico, sem mockup, fundo branco, apresentar construção em preto sólido.

A IA deve gerar direção/conceito. A versão final precisa ser redesenhada e revisada em vetor por designer, com busca de similaridade e disponibilidade de marca.

## P0.2 — Favicon e ícones do aplicativo

**Entregas:**

- `public/favicon.svg`;
- `public/favicon-32.png` — 32×32;
- `public/apple-touch-icon.png` — 180×180;
- `public/icon-192.png` — 192×192;
- `public/icon-512.png` — 512×512;
- `public/icon-maskable-512.png` — 512×512, zona segura central de 80%.

**Prompt:**

> Ícone quadrado minimalista para aplicativo “Lash Designer”, usar apenas o símbolo aprovado, fundo vinho profundo fosco, símbolo marfim quente, formas vetoriais nítidas, centralização óptica, alto contraste, sem texto, sem sombra 3D, sem mockup, preparado para recorte circular e maskable.

O pacote já inclui ícones provisórios derivados do símbolo atual e o manifesto está funcional. Ao aprovar a marca, substitua os arquivos mantendo exatamente os mesmos nomes e confira novamente os recortes `any` e `maskable`.

## P0.3 — Imagem do login

**Arquivo:** `public/login-bg.webp`.

**Tamanho:** 1800×2200 px, WebP qualidade visual 80–84, até 450 KB. Manter ação/rosto no terço central e espaço negativo no topo/esquerda para recortes responsivos.

**Prompt:**

> [PROMPT-BASE] Retrato vertical editorial de uma lash designer brasileira adulta em estúdio contemporâneo, preparando com precisão uma estação de atendimento impecável, expressão confiante e acolhedora, uniforme minimalista vinho ou grafite, detalhes marfim, luz lateral suave, profundidade de campo discreta, ambiente premium realista, composição com espaço negativo no topo e à esquerda, formato 4:5, sem texto, sem marca.

**Teste de aceite:** conferir em 1440×900, 1280×720 e celular; não cortar mãos/rosto de forma estranha; contraste suficiente com o painel de login.

## P0.4 — Hero do agendamento público

**Arquivo:** `public/imagemagenda.webp`.

**Tamanho:** 2000×1400 px, WebP até 420 KB. A imagem precisa ser horizontal; a provisória atual é vertical.

**Prompt:**

> [PROMPT-BASE] Close editorial horizontal de aplicação profissional de extensão de cílios em cliente adulta, procedimento tecnicamente seguro, olhos fechados, pads posicionados corretamente, mãos com luvas e pinças profissionais, cílios naturais e refinados, pele realista, iluminação suave, composição limpa com espaço negativo à direita para interface, formato 10:7, sem texto, sem logotipo.

**Teste de aceite:** ponto focal visível em desktop e mobile; interface nunca cobre olhos/mãos; ausência de artefatos anatômicos.

## P1.1 — Capas padrão de serviços

Seis imagens, 1600×1000 px, WebP até 260 KB:

- `service-classico.webp` — fio a fio clássico;
- `service-hibrido.webp` — híbrido elegante;
- `service-volume-brasileiro.webp` — volume brasileiro;
- `service-mega-volume.webp` — volume intenso, ainda plausível;
- `service-lash-lifting.webp` — lifting natural;
- `service-manutencao.webp` — manutenção/cuidado.

**Prompt-modelo:**

> [PROMPT-BASE] Macro beauty editorial mostrando resultado de **[TIPO DO SERVIÇO]** em mulher adulta, enquadramento lateral elegante do olho fechado e sobrancelha, acabamento profissional tecnicamente plausível, pele natural sem efeito plástico, luz difusa, fundo marfim desfocado, composição horizontal com espaço negativo inferior para card, sem texto, sem antes/depois, sem marca.

As seis imagens devem parecer parte da mesma sessão: luz, lente, distância e color grading consistentes, com diversidade de tons de pele.

## P1.2 — Imagem de compartilhamento social

**Arquivo:** `public/og-cover.jpg`.

**Tamanho:** 1200×630 px, JPG até 350 KB; área segura central de 1000×500.

**Composição final:** logo aprovado, frase curta aplicada manualmente, screenshot real do dashboard e detalhe fotográfico sutil. Não peça para a IA escrever a frase.

**Prompt para o fundo:**

> [PROMPT-BASE] Fundo abstrato editorial horizontal para capa de software beauty, gradiente orgânico entre marfim quente e rosé queimado, curvas sutis inspiradas em cílios e calendário, textura de papel premium quase imperceptível, centro limpo para tipografia e mockup, sem texto, sem ícones, formato 1200 por 630.

Depois, adicionar `og:image`, `twitter:card`, URL canônica e texto definitivo no `index.html` ou camada de renderização pública.

## P1.3 — Avatar e marca padrão do espaço

**Arquivos:** `public/tenant-placeholder.svg` e `public/avatar-placeholder.svg`.

**Requisitos:** neutros, legíveis em 32 px, não competir com a marca da profissional, fundo transparente ou facilmente adaptável.

**Prompt:**

> Símbolo placeholder vetorial neutro e elegante para estúdio de cílios, monograma abstrato sem letras específicas, curvas suaves, fundo rosé muito claro, traço vinho, leitura perfeita em 32 px, sem texto, sem rosto, sem mockup.

## P2.1 — Ilustrações de estado vazio

Quatro SVGs com `viewBox="0 0 640 480"`, até 80 KB, fundo transparente:

- `public/empty-calendar.svg`;
- `public/empty-clients.svg`;
- `public/empty-finance.svg`;
- `public/empty-domain.svg`.

**Prompt:**

> Ilustração vetorial editorial minimalista para estado vazio de **[TEMA]** em SaaS premium de beleza, formas arredondadas e geométricas, poucos elementos, contorno grafite suave, preenchimentos marfim, rosé queimado e vinho, pequenas sombras planas, personagem adulta opcional inclusiva sem detalhes faciais complexos, fundo transparente, sem texto, sem gradientes chamativos, coerente em série.

## P2.2 — Screenshots para ajuda, vendas e onboarding

Após deploy em staging, capturar em 1440×1024 e 390×844:

- visão geral ADMIN;
- agenda semanal;
- cadastro de serviço;
- financeiro;
- configuração de domínio;
- console DEV;
- agendamento público;
- portal da cliente.

Usar dados fictícios coerentes, sem telefone/e-mail real. Exporte WebP e preserve PNG original. Para cada captura, produzir uma versão limpa e outra anotada para documentação.

**Roteiro visual dos dados fictícios:** Studio Aurora, serviços reais com valores coerentes, agenda parcialmente preenchida, metas atingíveis, clientes com nomes fictícios diversos e domínio `agenda.studio-aurora.example` somente em material ilustrativo.

## Checklist de entrega

- licença comercial, autor e fonte registrados;
- model release quando houver pessoa real;
- nenhuma pessoa menor de idade;
- nenhuma marca de terceiro;
- procedimento de cílios tecnicamente seguro;
- contraste e recorte revisados em desktop/celular;
- SVG sem scripts, fontes externas ou metadados desnecessários;
- raster sem EXIF/localização/metadados sensíveis;
- nomes de arquivo exatamente iguais aos especificados;
- versões clara/escura e maskable conferidas;
- compressão sem banding ou artefatos;
- aprovação final de marca antes de tráfego pago.
