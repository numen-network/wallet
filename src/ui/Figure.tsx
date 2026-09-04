import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'

/** One number worth reading on its own, with the words that say what it is. */
export function Figure({ label, value, lit = false }: { label: string; value: string; lit?: boolean }) {
  return (
    <Card variant="muted" size="sm">
      <CardDescription>{label}</CardDescription>
      <CardTitle className={cn('font-mono text-[15px]', lit && 'text-primary')}>{value}</CardTitle>
    </Card>
  )
}
