# Causas-raiz corrigidas — 2.4.0

## 1. Largura e gutter competindo

A aplicação acumulava reservas independentes de `scrollbar-gutter`, cálculos com `100vw` e compensações locais ao bloquear scroll. O efeito aparecia como faixa vazia à direita, deslocamento ao abrir modal e diferenças conforme o zoom.

**Correção:** a 2.4 mantém um único contrato de gutter em `foundation-v24.css` e uma única compensação de scroll lock no `OverlayCoordinator`. As superfícies migradas não usam `100vw/100dvw` para calcular largura interna.

## 2. Sidebar recolhida ainda carregava geometria expandida

Textos e zonas antigas continuavam influenciando largura/altura mesmo invisíveis, principalmente em viewport baixo.

**Correção:** sidebar reconstruída em três zonas — marca, navegação rolável e conta fixa — com geometria própria no collapse e drawer independente no mobile.

## 3. Overlays herdavam o contexto do dashboard

Modais antigos podiam ser montados sob ancestrais transformados ou receber `z-index` inline legado. Isso limitava backdrop e permitia conflito com Product Tour.

**Correção:** `ModalRoot` faz portal direto para `document.body`; z-index legado é descartado; foco, Escape, restauração de foco e scroll lock são coordenados globalmente.

## 4. CSS mobile genérico alterava estruturas não relacionadas

Uma regra antiga aplicava flex ao primeiro `div` de cabeçalhos em vários cards. Em telas estreitas isso reduzia títulos a poucos pixels e gerava palavras em coluna de letras.

**Correção:** a regra foi neutralizada e módulos migrados receberam estruturas explícitas. Serviços agora usa cards próprios no mobile em vez de depender da tabela desktop.

## 5. Agenda dependia da viewport, não do contêiner

A Agenda inferia quantos dias cabiam a partir da janela, embora a largura útil mudasse com sidebar e zoom.

**Correção:** `ResizeObserver` mede o contêiner real e adapta a semana para 1/3/7 dias. Mês, horários e bloqueios possuem contratos próprios.

## 6. Modais/forms acumulavam gerações de layout

Headers, bodies e footers eram construídos com combinações diferentes de padding, altura e estilos inline.

**Correção:** contrato `ModalRoot` + `ld-dialog` com header/body/footer, viewport dinâmico, body rolável e bottom sheet onde necessário.

## 7. Uploads confiavam demais no metadado do navegador

Extensão/MIME declarados não eram suficientes e a conversão base64 podia exceder o payload final.

**Correção:** inspeção de assinatura binária, limites antes/depois do processamento, resize/compressão e respeito à orientação EXIF quando suportada.

## 8. Luma possuía experiências duplicadas

Página e launcher possuíam estados e apresentação parcialmente independentes.

**Correção:** `LumaConversation` centraliza histórico, composer, estados, cancelamento/erro e é reutilizada pelas superfícies da assistente.

## 9. Banners internos herdavam proporção de marketing

Dashboard e assinatura gastavam altura excessiva e criavam cortes visuais duros.

**Correção:** banners 2.4 têm composição interna compacta, assets integrados por gradiente/máscara e comportamento móvel próprio.

## 10. Legado ainda existente

A 2.4 é uma migração estrutural, não uma reescrita total. Permanecem regras antigas fora das superfícies migradas: aproximadamente 380 ocorrências de `!important` e 420 estilos inline no código total. As novas folhas `*-v24.css` usam apenas 2 `!important` e zero cálculos `100vw/100dvw` internos. Esse legado deve continuar sendo reduzido por módulo, sem criar outra camada global de overrides.
