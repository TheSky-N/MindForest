import { useEffect, useState } from 'react'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import githubDarkDefault from '@shikijs/themes/github-dark-default'

const THEME = 'github-dark-default'

interface Highlighter {
  loadLanguage(...langs: unknown[]): Promise<void>
  getLoadedLanguages(): string[]
  codeToHtml(code: string, options: { lang: string; theme: string }): string
}

type LanguageModule = { default: unknown }

const LANG_LOADERS: Record<string, () => Promise<LanguageModule>> = {
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

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighterCore({
    themes: [githubDarkDefault],
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
        const loader = LANG_LOADERS[language]
        if (loader) {
          await highlighter.loadLanguage((await loader()).default)
        }
        if (cancelled) return
        const lang = highlighter.getLoadedLanguages().includes(language) ? language : 'text'
        setHtml(highlighter.codeToHtml(code, { lang, theme: THEME }))
      } catch {
        if (!cancelled) setHtml(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, language, streaming])

  if (streaming || !html) {
    return (
      <pre className="my-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="my-2 overflow-hidden rounded-lg text-xs [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
