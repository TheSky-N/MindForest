import { useEffect, useState } from 'react'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { useAppStore, useEffectiveMode } from '../stores/appStore'
import { THEMES } from '../theme/palettes'

interface Highlighter {
  loadLanguage(...langs: unknown[]): Promise<void>
  loadTheme(...themes: unknown[]): Promise<void>
  getLoadedLanguages(): string[]
  getLoadedThemes(): string[]
  codeToHtml(code: string, options: { lang: string; theme: string }): string
}

type ShikiModule = { default: unknown }

const LANG_LOADERS: Record<string, () => Promise<ShikiModule>> = {
  bash: () => import('@shikijs/langs/bash'),
  css: () => import('@shikijs/langs/css'),
  diff: () => import('@shikijs/langs/diff'),
  go: () => import('@shikijs/langs/go'),
  html: () => import('@shikijs/langs/html'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  jsx: () => import('@shikijs/langs/jsx'),
  markdown: () => import('@shikijs/langs/markdown'),
  python: () => import('@shikijs/langs/python'),
  rust: () => import('@shikijs/langs/rust'),
  sql: () => import('@shikijs/langs/sql'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  yaml: () => import('@shikijs/langs/yaml')
}

const THEME_LOADERS: Record<string, () => Promise<ShikiModule>> = {
  'github-dark-default': () => import('@shikijs/themes/github-dark-default'),
  'github-light-default': () => import('@shikijs/themes/github-light-default'),
  nord: () => import('@shikijs/themes/nord'),
  'gruvbox-dark-medium': () => import('@shikijs/themes/gruvbox-dark-medium'),
  'gruvbox-light-medium': () => import('@shikijs/themes/gruvbox-light-medium'),
  'catppuccin-mocha': () => import('@shikijs/themes/catppuccin-mocha'),
  'catppuccin-latte': () => import('@shikijs/themes/catppuccin-latte'),
  'solarized-dark': () => import('@shikijs/themes/solarized-dark'),
  'solarized-light': () => import('@shikijs/themes/solarized-light')
}

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighterCore({
    themes: [],
    langs: [],
    engine: createJavaScriptRegexEngine()
  }).then((highlighter) => highlighter as unknown as Highlighter)
  return highlighterPromise
}

export function CodeBlock({
  code,
  language,
  streaming
}: {
  code: string
  language: string
  streaming?: boolean
}) {
  const themeId = useAppStore((state) => state.preferences.themeId)
  const mode = useEffectiveMode()
  const shikiTheme =
    THEMES.find((theme) => theme.id === themeId)?.shiki[mode] ?? 'github-dark-default'
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    if (streaming) {
      setHtml(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const highlighter = await getHighlighter()
        const langLoader = LANG_LOADERS[language]
        if (langLoader) {
          await highlighter.loadLanguage((await langLoader()).default)
        }
        const themeLoader = THEME_LOADERS[shikiTheme]
        if (themeLoader) {
          await highlighter.loadTheme((await themeLoader()).default)
        }
        if (cancelled) return
        const lang = highlighter.getLoadedLanguages().includes(language) ? language : 'text'
        const theme = highlighter.getLoadedThemes().includes(shikiTheme)
          ? shikiTheme
          : 'github-dark-default'
        setHtml(highlighter.codeToHtml(code, { lang, theme }))
      } catch {
        if (!cancelled) setHtml(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, language, streaming, shikiTheme])

  if (streaming || !html) {
    return (
      <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-card-muted p-3 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-border text-xs [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
