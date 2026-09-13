/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_BASE_URL?: string
  readonly VITE_DEV_HOST?: string
  readonly VITE_SUPPORT_URL?: string
  readonly VITE_PRIVACY_URL?: string
  readonly VITE_TERMS_URL?: string
  readonly VITE_SALES_URL?: string
  readonly VITE_SUBSCRIPTION_PRICE_CENTS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'gsap/all' {
  export const gsap: any
  export const ScrollTrigger: any
  export const SplitText: any
}
