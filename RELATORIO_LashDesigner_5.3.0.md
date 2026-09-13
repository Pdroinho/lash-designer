# Relatório — Lash Designer 5.3.0

## Escopo

Reconstrução comercial da landing sobre a base 5.2.0, após revisão visual indicar que a versão anterior ainda estava abaixo da referência Mangomint em hierarquia, copy de venda, ritmo, apresentação do produto e motion.

## Diagnóstico aplicado

A 5.2 ainda fazia quatro coisas fracas:

1. headline de posicionamento mais bonita que comprável;
2. screenshot tratado como conteúdo, não como peça de campanha;
3. excesso de seções explicativas em sequência;
4. features com peso maior que dores/resultados.

A 5.3 corrige esses pontos na estrutura.

## Mudanças principais

### Copy

- hero agora vende continuidade operacional durante o atendimento;
- supporting copy explica link + WhatsApp + gestão no mesmo lugar;
- CTA principal passa a vender simplificação da rotina;
- pricing usa linguagem de redução de improviso;
- CTA final conecta profissionalismo do atendimento ao profissionalismo da gestão.

### Hero e produto

- produto central ampliado e dominante;
- Agenda passa a ser a primeira demonstração;
- vídeo real de `product-flow` usado quando movimento é permitido;
- side peeks mostram experiência mobile da profissional e booking da cliente;
- logo real da marca substitui wordmark improvisado.

### Ritmo

- bloco escuro de rotina real cria primeira âncora de contraste;
- três seções longas foram substituídas por um módulo interativo;
- Luma é apresentada somente depois do fluxo operacional;
- diretório funcional comprime profundidade do produto sem criar mural de cards;
- pricing, FAQ e fechamento foram mantidos compactos.

### Módulo interativo

Três estados:

1. Agendamento — fotografia + booking + produto mobile;
2. WhatsApp — conversa simulada funcional, confirmação e atualização de agenda;
3. Gestão — dashboard real com chamadas sobre agenda e financeiro.

No mobile os estados empilham interface e texto sem overflow horizontal.

### Motion e acessibilidade

- CSS e APIs nativas apenas;
- `IntersectionObserver` para reveals;
- carousel automático de 6 s;
- vídeo com poster estático em reduced-motion;
- painéis operacionais com transição de opacity/transform;
- controles continuam sendo botões nativos.

## Bugs encontrados durante a própria implementação

- havia `id="como-funciona"` duplicado em duas seções; removido;
- ao remover CSS das antigas seções, estilos do mock de conversa do WhatsApp também foram removidos acidentalmente; o QA de estados detectou e a conversa recebeu novamente contrato visual próprio;
- audits da 5.3 ainda procuravam literalmente a copy antiga da 5.2; foram atualizados para verificar a promessa nova sem reduzir o contrato.

## QA visual

Full-page:

- 1920 × 1080: `scrollWidth === clientWidth`;
- 1440 × 900: `scrollWidth === clientWidth`;
- 768 × 900: `scrollWidth === clientWidth`;
- 390 × 844: `scrollWidth === clientWidth`.

Estados do módulo operacional também foram verificados separadamente em desktop e mobile.

## Gates

Todos os audits estáticos existentes voltaram verdes. Testes independentes de migration, sessão, criptografia, URL externa e WhatsApp passaram 53/53. O audit offline do lockfile reportou 0 vulnerabilidades.

## Limitação do ambiente

A árvore npm desta sessão ficou parcial e não permite declarar o gate integral de TypeScript/Vite como aprovado. O pacote final não inclui `node_modules` parcial.
