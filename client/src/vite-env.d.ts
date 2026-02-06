/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIM_URL: string
  readonly VITE_ALG_URL: string
  readonly VITE_DB_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
