import { screen, type BrowserWindow } from 'electron'
import type { SettingsRepository } from './db/repositories/settings'

export const WINDOW_STATE_KEY = 'window.state'
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 820
const MIN_WIDTH = 960
const MIN_HEIGHT = 600

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

function parseState(raw: string | undefined): WindowState | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<WindowState>
    const width = Number(value.width)
    const height = Number(value.height)
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    return {
      x: Number.isFinite(Number(value.x)) ? Number(value.x) : undefined,
      y: Number.isFinite(Number(value.y)) ? Number(value.y) : undefined,
      width: Math.max(Math.round(width), MIN_WIDTH),
      height: Math.max(Math.round(height), MIN_HEIGHT),
      maximized: value.maximized === true
    }
  } catch {
    return null
  }
}

function isVisibleOnAnyDisplay(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return false
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      state.x! + 80 < area.x + area.width &&
      state.x! + state.width - 80 > area.x &&
      state.y! + 40 < area.y + area.height &&
      state.y! + state.height - 40 > area.y
    )
  })
}

export function loadWindowState(settings: SettingsRepository): WindowState {
  const stored = parseState(settings.get(WINDOW_STATE_KEY))
  if (!stored) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: false }
  }
  if (stored.x !== undefined && stored.y !== undefined && !isVisibleOnAnyDisplay(stored)) {
    return { width: stored.width, height: stored.height, maximized: stored.maximized }
  }
  return stored
}

export function captureWindowState(window: BrowserWindow): WindowState {
  const bounds = window.getNormalBounds()
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, MIN_WIDTH),
    height: Math.max(bounds.height, MIN_HEIGHT),
    maximized: window.isMaximized()
  }
}

export function attachWindowStatePersistence(
  settings: SettingsRepository,
  window: BrowserWindow
): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const persist = () => {
    try {
      settings.set(WINDOW_STATE_KEY, JSON.stringify(captureWindowState(window)))
    } catch {
      void 0
    }
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, 400)
  }
  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  window.on('close', () => {
    if (timer) clearTimeout(timer)
    persist()
  })
}
