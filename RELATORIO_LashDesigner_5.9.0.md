# Relatório técnico — Lash Designer 5.9.0

Release focada em coerência de branding multi-tenant.

## Problema corrigido

A aplicação tratava `primaryColor` principalmente como accent. As superfícies base continuavam com neutros rosados fixos e algumas telas tinham vinho hardcoded, criando uma interface híbrida quando a profissional escolhia verde, azul, lavanda etc.

## Solução

A camada `theme.ts` agora gera um conjunto de superfícies claras e linhas derivadas do tenant e propaga esses tokens para o sistema legado e para o Product Design System. Dashboard, setup, shell e booking foram alinhados a esse contrato.

Também foram corrigidos problemas visuais objetivos do setup: inputs com altura indevida, overflow horizontal no catálogo e preview de paleta que não alterava a interface do próprio setup.

## Segurança funcional

Nenhum endpoint, schema, sessão, billing ou integração foi alterado.

## Gates executados

- Theme audit 20/20
- Responsive 26/26
- Visual 22/22
- Onboarding 16/16
- Consistency 19/19
- Security 43/43
- Independent tests 60/60

## Limitação do ambiente

O TypeScript integral para em `TS2688` por ausência de `vite/client`. O browser desta sessão também bloqueou navegação local para um QA visual Chromium adicional; por isso esse gate não é declarado como executado.
