import { LumaConversation } from '../../components/LumaConversation'
import { LumaCreditStatus } from './LumaCreditStatus'
import './luma-workspace.css'

export function LumaWorkspace() {
  return (
    <section className="luma-workspace">
      <LumaCreditStatus />
      <section className="luma34-page">
        <LumaConversation variant="page" />
      </section>
    </section>
  )
}
