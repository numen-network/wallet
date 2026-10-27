import type { Token } from '@/chain/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/cn'

/** A token's logo, or the first letters of its symbol when the wallet has none. */
export function TokenMark({
  token,
  className,
}: {
  token: Pick<Token, 'icon' | 'symbol'>
  className?: string
}) {
  return (
    <Avatar className={cn('text-[11px]', className)}>
      {token.icon && <AvatarImage src={token.icon} alt="" />}
      <AvatarFallback className="text-[length:inherit] font-bold">
        {token.symbol.slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  )
}
