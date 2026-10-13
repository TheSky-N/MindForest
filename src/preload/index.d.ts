import type { MindForestApi } from '@shared/api'

declare global {
  interface Window {
    mindforest: MindForestApi
  }
}

export {}
