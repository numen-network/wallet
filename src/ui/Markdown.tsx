import { useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/cn'

const https = (url: string | undefined) => url !== undefined && /^https:\/\//i.test(url)

/** Falls back to a link when the address isn't an https image the browser can draw. */
function Picture({ href, alt }: { href: string | undefined; alt: string | undefined }) {
  const [broken, setBroken] = useState(false)
  if (https(href) && !broken) {
    return (
      <img
        src={href}
        alt={alt ?? ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {alt || href}
    </a>
  )
}

const components: Components = {
  a: ({ node: _, ...props }) =>
    props.href?.startsWith('#') ? (
      <a {...props} />
    ) : (
      <a {...props} target="_blank" rel="noopener noreferrer" />
    ),
  img: ({ src, alt }) => {
    const href = typeof src === 'string' ? src : undefined
    // Keyed so a fixed address in the editor gets a fresh try
    return <Picture key={href} href={href} alt={alt} />
  },
  table: ({ node: _, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
}

/**
 * Text from the chain as the explorer renders it, same plugins and same
 * overrides, so what a proposer previews here is what voters read there.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div dir="auto" className={cn('prose prose-sm max-w-none wrap-anywhere', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
