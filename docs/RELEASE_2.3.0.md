# Release 2.3.0 — Sales & Smart Start

## Landing comercial

- narrativa reconstruída ao redor de uma promessa única: tirar a gestão do meio das conversas;
- hero mais curto, preço visível antes do primeiro CTA e oferta mensal/anual explicada sem ambiguidade;
- remoção da antiga prévia de interface desenhada em HTML/CSS;
- capturas reais do dashboard, Agenda e Luma integradas à página;
- loop WebM/MP4 leve com telas reais e fallback estático para movimento reduzido;
- prova baseada no produto, sem depoimentos, métricas ou conversas inventadas;
- redução da página para cinco decisões: produto, fluxo, setup, preço e dúvidas.

## Compra direta

- checkout dividido em escolha do ciclo e criação do acesso;
- os quatro ciclos mostram equivalente mensal e total pago;
- identidade, horários e serviços foram removidos da compra e movidos para o pós-pagamento;
- desconto por indicação continua calculado exclusivamente no servidor;
- retorno do checkout mostra o espaço correto e orienta o próximo acesso.

## Smart Start

- novo setup pós-compra em quatro etapas: caminho, identidade, agenda e catálogo;
- opção assistida pela Luma e opção totalmente manual;
- análise opcional de logo por modelo multimodal, com três sugestões e aprovação humana;
- fallback curado quando a IA está desligada, indisponível ou atinge o limite;
- até três análises visuais por tenant durante o setup;
- gravação atômica de marca, horários, serviços e conclusão;
- tenants existentes são migrados como concluídos e não recebem o fluxo indevidamente;
- endpoint e modelo multimodal configuráveis separadamente por ambiente.

## Navegação da plataforma

- sidebar recolhível para 82 px no desktop;
- escolha persistida localmente;
- ícones, tooltips, estado ativo e perfil preservados no modo compacto;
- drawer móvel continua com largura integral e ignora o estado de collapse do desktop.

## Identidade temporária

A landing não usa os arquivos de logo questionados como marca principal. Até a entrega do vetor definitivo, utiliza um wordmark tipográfico neutro e substituível. Os arquivos de marca internos permanecem inalterados para não inventar uma nova identidade antes da vetorização aprovada.
