import {
  backing,
  identityState,
  isQualified,
  shortfall,
  STATE_WORDS,
  type Standing,
} from '@/chain/identity'
import { JudgementBadge } from '@/ui/JudgementBadge'

/**
 * What the registrars made of an identity, with the reason on hover. Wherever an
 * account stands for somebody this is the first thing worth knowing about it,
 * which is why the account board and the referenda list both lead with it. A sub
 * shows the verdict on the parent, since that is the record it answers to.
 */
export function IdentityVerdict({ standing }: { standing: Standing }) {
  const registration = backing(standing)
  if (!registration) return null

  const verdict = identityState(registration)

  return (
    <JudgementBadge
      verdict={verdict}
      title={
        isQualified(standing)
          ? `${STATE_WORDS[verdict]}, so this account clears the identity standard`
          : `${STATE_WORDS[verdict]}. ${shortfall(standing) ?? ''}`
      }
    />
  )
}
