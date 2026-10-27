import type { Token } from '@/chain/types'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/cn'

/** A token's logo, or a blank of the same size so rows without one stay aligned. */
export function TokenMark({
  token,
  className,
}: {
  token: Pick<Token, 'icon'>
  className?: string
}) {
  if (!token.icon) return <span aria-hidden className={cn('block size-8 shrink-0', className)} />

  return (
    <Avatar className={className}>
      <AvatarImage src={token.icon} alt="" />
    </Avatar>
  )
}
