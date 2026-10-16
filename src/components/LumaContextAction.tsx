import { LumaMark } from './LumaBrand'
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
              screen,
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
