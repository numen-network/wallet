import { Button } from '@/components/ui/button'
import { Tip } from '@/ui/Tip'

/**
 * Money held somewhere else that an account can pull in. It sits above the
 * balance in red so nobody misses it. What Claim does is up to the caller.
 */
export function ClaimNotice({
  text,
  tip,
  disabled = false,
  reason,
  onClaim,
}: {
  text: string
  /** The amount behind the line, for a claim with no dialog to show it. */
  tip?: string
  disabled?: boolean
  /** Why Claim is shut. */
  reason?: string | undefined
  onClaim: () => void
}) {
  return (
    <div data-nodrag className="mb-1 flex items-center gap-1.5 text-[12.5px] text-destructive">
      <Tip text={tip}>
        <span>{text}</span>
      </Tip>
      <Tip text={disabled ? reason : undefined}>
        <span className="flex has-[:disabled]:cursor-not-allowed">
          <Button type="button" variant="soft" size="xs" disabled={disabled} onClick={onClaim}>
            Claim
          </Button>
        </span>
      </Tip>
    </div>
  )
}
