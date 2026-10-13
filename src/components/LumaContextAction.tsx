import { LumaMark } from './LumaBrand'
const prompts: Record<string, string> = {
  team: 'Me ajude a organizar a equipe, os serviços e os horários das profissionais.',
  support:
    'Consulte meus pedidos de ajuda e me explique se há alguma resposta da equipe ou algo que preciso fazer.',
  finance:
    'Consulte meu financeiro atual e me ajude a entender entradas, despesas, saldo e metas. Não altere nada sem minha confirmação.',
  calendar:
    'Consulte minha agenda de hoje e destaque horários, profissionais e atendimentos passados sem comparecimento registrado.',
  billing:
    'Explique como funcionam os planos por equipe, a validade da assinatura e os créditos da Luma. Não execute pagamentos.',
}
export function LumaContextAction({ screen }: { screen: string }) {
  return (
    <button
      type="button"
      className="btn btn-ghost luma-context-action"
      data-tour="luma-context"
      aria-label="Pedir ajuda à Luma nesta tela"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('lashdesigner:luma-open', {
            detail: {
              prompt:
                prompts[screen] ??
                'Consulte os dados reais do meu estúdio e me ajude a identificar o próximo passo mais útil.',
            },
          }),
        )
      }
    >
      <LumaMark />
      <strong>Luma</strong>
    </button>
  )
}
