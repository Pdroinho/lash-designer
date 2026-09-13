# Landing page comercial — 5.3

## Objetivo

A raiz do domínio principal vende o Lash Designer para profissionais de extensão de cílios. A direção 5.3 é sales-first e product-first: a página deve vender alívio operacional e profissionalismo antes de listar funcionalidades.

Rotas permanecem:

- domínio principal `/`: landing page;
- domínio principal `/login`: localizador do espaço;
- hostname DEV `/`: console DEV após autenticação;
- hostname DEV `/landing`: prévia da landing em desenvolvimento;
- domínio de tenant `/`: login/redirecionamento por papel;
- domínio de tenant `/agendar`: agendamento público.

## Princípios da direção 5.3

1. **Resultado antes de feature.** A promessa é reduzir a administração entre atendimentos.
2. **Mecanismo imediatamente visível.** Link de agendamento + WhatsApp + gestão explicam como o benefício acontece.
3. **Produto real como principal peça visual.** Agenda, Visão Geral e Luma aparecem em escala e movimento.
4. **Ritmo editorial.** Alternar silêncio, produto, fotografia e contraste; evitar sequência de cards explicativos.
5. **Revelar profundidade por interação.** Agendamento, WhatsApp e Gestão dividem um único palco interativo.
6. **Luma depois do core.** IA é camada opcional de leitura, não promessa principal.
7. **Sem prova falsa.** Depoimentos, logos, notas e resultados só entram quando reais e autorizados.
8. **Mobile recomposto.** Elementos laterais e densidade desktop não são simplesmente espremidos.

## Estrutura de conversão

1. hero: “Seu studio continua funcionando enquanto você atende” + CTA + produto;
2. faixa de três resultados concretos;
3. bloco escuro “Pare de administrar seu studio entre uma cliente e outra”;
4. módulo interativo: Agendamento / WhatsApp / Gestão;
5. Luma opcional;
6. diretório do produto;
7. quatro ciclos reais de plano;
8. FAQ;
9. CTA final + footer editorial.

## Referência visual

Mangomint é referência de nível de execução e princípios: hero simples, produto em escala, espaço, aurora, contraste, tipografia forte, motion funcional e adaptação mobile. Não copiar marca, identidade, textos, taxonomia, prova social, paleta ou layout proprietário.

## CTA comercial

Todos os CTAs comerciais continuam abrindo `LandingCheckout`. O ciclo escolhido é preservado até o checkout seguro gerado no servidor.

Cada clique continua disparando:

- `lashdesigner:cta` com `{ location }`;
- `dataLayer.push({ event: 'landing_cta_click', location })` quando `window.dataLayer` existir.

A landing não instala rastreadores automaticamente.

## Produto e fotografia

Screenshots e vídeos reais do produto ficam em `public/landing/product/`. Nunca publicar dados identificáveis de clientes.

Fotografia editorial é usada para contextualizar o produto. A evolução de maior impacto continua sendo substituir fotografias de apoio por um ensaio próprio com lash designer/studio real, mantendo a arquitetura da página.

## Prova social

Não publicar customer story sem autorização e evidência. Antes de inserir:

- autorização de nome/foto/fala;
- texto original ou edição aprovada;
- comprovação de números/resultados;
- possibilidade de revogação.

## Movimento

A 5.3 usa CSS e APIs nativas:

- auroras com gradientes radiais;
- vídeo real de produto no hero;
- carousel automático de 6 s;
- painel operacional interativo;
- `IntersectionObserver` para reveal;
- transições de opacity/transform.

`prefers-reduced-motion: reduce` substitui o vídeo por poster e desliga movimento não essencial.

## Responsividade

Gate visual mínimo:

- 390 × 844;
- 768 × 900;
- 1440 × 900;
- 1920 × 1080.

Também validar os três estados do módulo operacional em desktop e mobile.

## SEO e indexação

O HTML-base permanece `noindex,nofollow` para proteger rotas privadas. Em produção, o servidor troca para `index,follow` e canônica somente quando hostname/caminho correspondem à landing pública.

## Preço comercial

A landing consulta o catálogo público e mostra mensal, trimestral, semestral e anual. Não duplicar preços como fonte de verdade no frontend.

## Checklist de publicação

- [ ] termos, privacidade e suporte publicados;
- [ ] preços/condições iguais ao catálogo de produção;
- [ ] nenhum depoimento, logo ou número sem comprovação;
- [ ] screenshots correspondem ao release e não contêm dados reais;
- [ ] assets fotográficos possuem licença/model release;
- [ ] 4 viewports sem overflow horizontal;
- [ ] 3 estados do módulo operacional verificados em desktop/mobile;
- [ ] vídeo/carousel/reveals respeitam reduced-motion;
- [ ] CTA abre checkout no ciclo correto;
- [ ] Lighthouse/WebPageTest executados na URL real;
- [ ] `/` retorna `index,follow` + canônica em produção;
- [ ] rotas privadas/DEV continuam `noindex`.
