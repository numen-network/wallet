import { AddressField } from '@/accounts/AddressField'
import { SignerField, useSigning } from '@/accounts/Authorize'
import { canSend, signersFor, type Account } from '@/accounts/types'

/**
 * At least one account, which is what every dialog here needs before it can
 * offer to sign anything. The page checks that once rather than each dialog
 * guarding against a list it was never meant to be handed.
 */
export type Voters = [Account, ...Account[]]

export function voters(accounts: Account[]): Voters | null {
  const [first, ...rest] = accounts.filter(canSend)
  return first ? [first, ...rest] : null
}

/**
 * The account a dialog acts as, and whoever signs for it. Governance is about a
 * referendum rather than about an account, so the account is picked inside the
 * dialog. Which address is picked stays with the caller, since one dialog keeps
 * it in a draft that outlives the dialog.
 */
export function useVoter(accounts: Voters, address: string) {
  const account = accounts.find((entry) => entry.address === address) ?? accounts[0]
  return { account, ...useSigning(account, signersFor(account, accounts)) }
}

export type Voter = ReturnType<typeof useVoter>

/** Both pickers, since a multisig needs a signatory before it can act. */
export function VoterField({
  accounts,
  voter,
  onChange,
}: {
  accounts: Voters
  voter: Voter
  onChange: (address: string) => void
}) {
  return (
    <>
      <AddressField
        label="Voting as"
        value={voter.account.address}
        onChange={onChange}
        accounts={accounts}
        readOnly
      />
      <SignerField
        account={voter.account}
        signer={voter.signer}
        bench={voter.bench}
        onChange={voter.choose}
      />
    </>
  )
}
