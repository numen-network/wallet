import { useEffect, useState } from 'react'
import { CheckIcon, CopyIcon } from './icons'
import { copyAddress } from './clipboard'

interface CopyButtonProps {
  text: string
  label: string
  /** Spelled out beside the icon, where an icon on its own says too little. */
  spelled?: boolean
  className?: string
}

export function CopyButton({ text, label, spelled = false, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1_200)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    copyAddress(text)
    if (navigator.clipboard) setCopied(true)
  }

  return (
    <button
      type="button"
      data-nodrag
      onClick={copy}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded p-0.5 ${
        spelled ? 'text-[12.5px]' : 'grid place-items-center'
      } ${copied ? 'text-accent' : 'text-dim hover:text-ink'} ${className}`}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {spelled && (copied ? 'Copied' : label)}
    </button>
  )
}
