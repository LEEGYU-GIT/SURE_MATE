import type { SureMateApi } from '../shared/ipc-channels'

declare global {
  interface Window {
    sureMate: SureMateApi
  }
}

export {}
