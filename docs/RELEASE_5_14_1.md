# 5.14.1 — Agendamento pensado para o celular

## O que mudou

- Catálogo mobile em lista vertical: foto pequena, nome completo, duração e valor visíveis. Sai o carrossel de imagens grandes que escondia os demais serviços. A busca existente continua disponível em catálogos com seis ou mais serviços, inclusive sem acentos.
- Títulos mais curtos no celular, tipografia menor, espaçamento consistente e campos com 16 px para evitar zoom automático no iPhone. A composição desktop do cabeçalho e a marca centralizada na coluna original foram preservadas.
- A etapa de profissional e data mostra primeiro o serviço escolhido. A seleção usa os mesmos avatares e rádios já existentes, com indicadores alinhados. Equipes com mais de três profissionais têm a lista expansível; o calendário fica acessível sem atravessar quinze cards. Com apenas uma profissional não se pede uma escolha desnecessária.
- Calendário compacto e horários organizados por período, com controles consistentes também na faixa de 769 a 820 px. Barras de progresso têm áreas de toque maiores para voltar a uma etapa disponível.
- Resumo antes da reserva inclui a profissional escolhida. Consentimento promocional continua opcional e desmarcado, separado da reserva.
- Botão de reservar no fluxo da página, sem sobrepor campos ou textos. Ao trocar de etapa, a página volta ao topo e o foco acompanha o título, inclusive após escolher um item no fim de uma lista longa.
- Confirmação mobile sem a fotografia gigante: serviço, dia/horário, profissional e valor ficam organizados, seguidos das ações de consultar horários e fazer outra reserva. A confirmação desktop também usa dados separados em linhas para leitura clara.

## Implementação

`src/booking-mobile-refinement.css` é importado após as camadas anteriores e usa a paleta do estúdio. A camada antiga de mobile deixava a galeria e a foto de confirmação grandes; o refino substitui essas regras sem alterar outras áreas da plataforma. O componente continua usando os mesmos endpoints, disponibilidade por profissional, fuso do estúdio e validação de reserva. Não há migração nova: o banco permanece na versão 50.

O script existente de revisão ganhou `npm run test:booking-mobile-ui`. A auditoria mobile foi atualizada para exigir a lista vertical e a confirmação focada nos dados, em vez de exigir os estilos antigos.

## Validação

- `npm run check`: TypeScript, lint, 309 testes automatizados (249 principais, 14 migrações, 11 primitivas e 35 WhatsApp), auditorias e build aprovados. Após o último ajuste de CSS para tablets, o build, lint e a auditoria mobile foram executados novamente.
- Navegador Chromium com o frontend compilado e APIs controladas: fluxo completo nas larguras 320, 360, 390, 430, 768, 820 e 1440 px. Validação de nome/telefone, seleção de profissional, data/horário, consentimento, conflito de disponibilidade, envio dos dados, confirmação e reinício.
- Cenários adicionais: catálogo com busca e nenhum resultado, nome longo de serviço, quinze profissionais, profissional única, falha no catálogo e foco/rolagem na troca de etapa. 12/12 verificações do grupo de agendamento aprovadas.
- Regressões no navegador: 30/30 verificações de marca em login, agendamento e painel, com logos completas e símbolo/nome em três tamanhos; 70/70 verificações gerais de interface, incluindo seleção por teclado, consentimento com um único check, temas e equipe.
- Revisão visual das capturas das etapas e confirmação, incluindo a menor largura e a transição para tablet. As capturas são evidência interna de teste e não fazem parte do pacote.

Os testes de navegador usam respostas locais controladas; não fizeram reservas em um estúdio real, não enviaram WhatsApp e não publicaram a aplicação. Na homologação, repita o fluxo em celulares reais Android/iOS com as marcas, serviços e profissionais do ambiente antes do deploy. A suíte de rotas e regras de reserva existente também passou no check geral.
