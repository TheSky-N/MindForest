import { memo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { CodeBlock } from './CodeBlock'

function extractCodeProps(child: ReactNode): {
  className?: string
  children?: ReactNode
} {
  if (typeof child === 'object' && child !== null && 'props' in child) {
    return (child as { props: { className?: string; children?: ReactNode } }).props
  }
  return {}
}

export const Markdown = memo(function Markdown({
  content,
  streaming,
  compact
}: {
  content: string
  streaming?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={`mf-markdown prose prose-sm max-w-none break-words dark:prose-invert prose-a:text-accent prose-blockquote:border-accent prose-blockquote:text-fg-muted prose-code:text-accent prose-headings:text-fg prose-hr:border-border prose-li:text-fg prose-pre:bg-transparent prose-pre:p-0 prose-strong:text-fg prose-table:text-fg ${
        compact ? 'mf-markdown-compact' : ''
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children
            const props = extractCodeProps(child)
            const language = /language-(\w+)/.exec(props.className ?? '')?.[1] ?? 'text'
            const code = String(props.children ?? '').replace(/\n$/, '')
            return <CodeBlock code={code} language={language} streaming={streaming} />
          },
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
