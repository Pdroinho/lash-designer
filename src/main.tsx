import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './responsive.css'
import './design-system.css'
import './product-system-v33.css'
import './product-controls-v40.css'
import './setup.css'
import './foundation-v24.css'
import './shell-v24.css'
import './overlays-v24.css'
import './tour-v24.css'
import './forms-v24.css'
import './services-v24.css'
import './whatsapp-v24.css'
import './whatsapp-v39.css'
import './agenda-v24.css'
import './dashboard-v24.css'
import './finance-v24.css'
import './finance-v36.css'
import './billing-v24.css'
import './luma-v35.css'
import './landing-v24.css'
import './auth-v24.css'
import './booking-v30.css'
import './appointment-lifecycle-v371.css'
import './mobile-app-v510.css'
import './mobile-app-v510-part3.css'
import './landing-v25.css'
import './mobile-app-v510-part4.css'
import './mobile-experience-v511.css'
import { initTheme } from './theme'
import { FeedbackCenter } from './components/FeedbackCenter'
import { OverlayCoordinator } from './components/OverlayCoordinator'

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[UI] erro não tratado', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error-page">
          <div className="fatal-error-card">
            <div className="fatal-error-mark">LD</div>
            <h1>Não foi possível carregar esta tela</h1>
            <p>Atualize a página. Caso o problema continue, envie o horário do erro para o suporte.</p>
            <button type="button" className="btn btnPrimary" onClick={() => window.location.reload()}>Recarregar página</button>
          </div>
        </main>
      )
    }
    return this.props.children
  }
}

initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Elemento #root não encontrado')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
        <OverlayCoordinator />
        <FeedbackCenter />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
