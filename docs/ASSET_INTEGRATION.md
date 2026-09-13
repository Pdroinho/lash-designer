# Integração do kit visual 1.2

## Objetivo

Este release instala um kit inicial completo e coerente para lançamento. Os arquivos foram processados para uso real no navegador, com recorte, compressão, transparência e nomes estáveis.

## Arquivos instalados

### Marca

- `public/brand/logo-horizontal-dark.png`
- `public/brand/logo-horizontal-light.png`
- `public/brand/logo-horizontal.svg`
- `public/brand/logo-symbol.png`
- `public/brand/logo-symbol-light.png`
- `public/brand/app-icon-master.png`

O símbolo aparece na sidebar e como fallback da tela de login. O logotipo vetorial é uma versão operacional autônoma; antes de registro de marca, impressão ou campanha nacional, faça busca de similaridade e redesenho vetorial final.

### Imagens principais

- `public/login-bg.webp`: imagem editorial da tela de login.
- `public/imagemagenda.webp`: hero horizontal do agendamento público.
- `public/og-cover.jpg`: compartilhamento social.

### Capas de serviços

- `public/services/service-classico.webp`
- `public/services/service-hibrido.webp`
- `public/services/service-volume-brasileiro.webp`
- `public/services/service-mega-volume.webp`
- `public/services/service-lash-lifting.webp`
- `public/services/service-manutencao.webp`

Quando um serviço não possui `coverUrl`, o frontend escolhe automaticamente uma capa local pelo nome do serviço. Mega, lifting, manutenção, volume brasileiro e híbrido usam suas capas específicas; nomes sem correspondência usam a capa clássica.

A profissional ainda pode enviar uma imagem própria. Em caso de URL quebrada, o frontend usa `public/placeholders/service-placeholder.webp`.

### Placeholders

- `public/placeholders/tenant-placeholder.png`
- `public/placeholders/avatar-placeholder.png`
- `public/placeholders/service-placeholder.webp`

### Estados vazios

- `public/empty-states/empty-calendar.png`
- `public/empty-states/empty-clients.png`
- `public/empty-states/empty-finance.png`
- `public/empty-states/empty-domain.png`

Foram aplicados em serviços, clientes, histórico de pagamentos, agenda, financeiro e configuração de domínio.

### PWA e favicon

- `public/favicon.svg`
- `public/favicon-32.png`
- `public/apple-touch-icon.png`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/icon-maskable-512.png`

Os ícones usam fundo vinho sólido e símbolo marfim. O ícone maskable mantém o símbolo dentro da zona segura.

## Metadados

`index.html` referencia `og-cover.jpg` em Open Graph e Twitter Card. A camada pública continua responsável por substituir título, URL canônica e `robots` conforme o tenant e a rota.

## Performance

As fotos foram convertidas para WebP e comprimidas. Capas usam `loading="lazy"`; imagens principais permanecem locais, sem dependência de CDN externa. Não troque os nomes sem atualizar as referências do código e `public/assets-manifest.json`.

## Licenciamento e aceite

As imagens deste kit são assets visuais gerados especificamente para o projeto. Antes de uma campanha de grande alcance:

1. valide a marca e o símbolo juridicamente;
2. revise os procedimentos de cílios com uma profissional qualificada;
3. faça homologação de recorte em desktop e celular;
4. mantenha o arquivo mestre e o histórico de aprovação da identidade.
