import type { ProductTourStep } from '../components/ProductTour'

export const shellTourSteps = (area: 'admin' | 'dev' | 'client', screen: string): ProductTourStep[] => {
  const audience = area === 'dev' ? 'plataforma' : area === 'client' ? 'sua área' : 'seu negócio'
  const screenLabels: Record<string, string> = {
    dashboard: 'visão geral',
    calendar: 'agenda',
    clients: 'clientes',
    services: 'serviços',
    finance: 'financeiro',
    evolution: 'WhatsApp',
    settings: 'configurações',
    tenants: 'espaços',
    integrations: 'integrações',
    backups: 'backups',
    appointments: 'agendamentos',
  }
  const screenDescriptions: Record<string, string> = {
    dashboard: 'Acompanhe agenda, faturamento previsto, clientes e atividades recentes sem precisar montar relatórios manualmente.',
    calendar: 'Crie, confirme, reagende e acompanhe os atendimentos em uma visão organizada por data.',
    clients: 'Consulte o histórico das clientes e identifique relacionamento, retorno e valor gerado.',
    services: 'Mantenha catálogo, duração, preço, imagem e disponibilidade dos serviços sempre atualizados.',
    finance: 'Acompanhe entradas, despesas, metas e evolução mensal do espaço.',
    evolution: 'Configure automações e mensagens do WhatsApp com atenção às credenciais e ao consentimento das clientes.',
    settings: 'Personalize a marca, gerencie assinatura, segurança e os domínios conectados ao espaço.',
    tenants: 'Gerencie os espaços cadastrados, assinaturas e acessos da plataforma em um só lugar.',
    integrations: 'Revise integrações externas, credenciais e estado operacional dos provedores.',
    backups: 'Exporte e restaure cópias de segurança com um fluxo administrativo controlado.',
    appointments: 'Veja seus próximos atendimentos e o status de cada solicitação.',
  }

  const steps: ProductTourStep[] = [
    {
      selector: '[data-tour="brand"]',
      eyebrow: 'Bem-vinda',
      title: `Seu centro de controle de ${audience}`,
      description: 'A interface foi organizada para deixar as ações mais importantes acessíveis e reduzir o tempo gasto com tarefas repetitivas.',
    },
    {
      selector: '[data-tour="sidebar"]',
      title: 'Navegação por contexto',
      description: 'Use o menu lateral para alternar entre as áreas. No celular, as áreas principais ficam na barra inferior e o restante em Mais.',
    },
    {
      selector: '[data-tour="content"]',
      title: `Tela de ${screenLabels[screen] ?? screen}`,
      description: screenDescriptions[screen] ?? 'Aqui ficam as informações e ações principais desta tela.',
    },
    {
      selector: '[data-tour="search"]',
      title: 'Encontre mais rápido',
      description: 'Pesquise espaços pelo nome ou identificador sem percorrer toda a lista.',
    },
    {
      selector: '[data-tour="notifications"]',
      title: 'Atualizações importantes',
      description: 'Consulte alertas operacionais e financeiros sem interromper o fluxo de trabalho.',
    },
  ]
  const filtered = area === 'dev' && screen === 'tenants' ? steps : steps.filter((step) => step.selector !== '[data-tour="search"]')
  if (area === 'admin' && screen === 'settings') {
    filtered.splice(3, 0, {
      selector: '[data-tour="custom-domains"]',
      title: 'Seu endereço profissional',
      description: 'Conecte um domínio próprio com verificação DNS e HTTPS automático. O painel mostra cada registro e o estado da propagação.',
    })
  }
  return filtered
}

