# Lash Designer 5.4.1 — Landing Corrective

Correção direta da landing 5.4 após a regressão visual da 5.5.

## Preservado

- direção visual da 5.4;
- hero, bloco editorial, fluxo, Luma e índice da 5.4;
- GSAP apenas para entrada/reveal/parallax leve;
- checkout e tracking existentes.

## Corrigido

- produto não mantém mais a última tela sobre as demais: somente a mídia ativa é montada;
- Agenda → Visão geral → Luma volta ao início automaticamente;
- seleção manual pausa o autoplay por 9 segundos;
- fluxo Agendamento → WhatsApp → Gestão também monta somente o painel ativo e volta ao início;
- GSAP não controla mais estado de tabs/carousels;
- máscaras de SplitText foram removidas para impedir clipping de acentos e títulos;
- transição entre estados passou a ser CSS e respeita reduced motion;
- pricing comercial da 5.5 foi preservado, sem carregar Bento, console Luma ou a estética da 5.5;
- economia dos ciclos é calculada contra o valor mensal retornado pela própria API, não contra preço fallback hardcoded.

## Pricing

Todos os ciclos liberam o mesmo produto e a seção deixa explícitos os recursos incluídos, a oferta do primeiro mês mensal e a economia em reais de ciclos mais longos.
