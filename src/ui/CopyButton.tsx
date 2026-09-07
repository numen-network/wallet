import { useEffect, useState, type ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { Check, Copy } from 'lucide-react'
import { copyText } from './clipboard'
import { Tip } from './Tip'

interface CopyButtonProps {
  text: string
  label: string
  /** Spelled out beside the icon, where an icon on its own says too little. */
  spelled?: boolean
  variant?: ComponentProps<typeof Button>['variant']
  className?: string
}

export function CopyButton({ text, label, spelled = false, variant = spelled ? 'ghost' : 'plain', className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1_200)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    copyText(text)
    if (navigator.clipboard) setCopied(true)
  }

  return (
    <Tip text={label}>
      <Button
        type="button"
        variant={variant}
        size={spelled ? 'sm' : 'icon-xs'}
        data-nodrag
        aria-label={label}
        className={cn(copied && 'text-primary', className)}
        onClick={copy}
      >
        {copied ? <Check strokeWidth={2.4} /> : <Copy />}
        {spelled && (copied ? 'Copied' : label)}
      </Button>
    </Tip>
  )
}
