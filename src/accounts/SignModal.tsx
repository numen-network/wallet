import { useState, type ReactNode } from 'react'
import { shorten } from '@/lib/address'
import { signMessage, verifyMessage, type Verdict } from '@/signing/message'
import { VaultError } from '@/signing/vault'
import { CopyButton } from '@/ui/CopyButton'
import { Field, FieldError, Modal, Textarea } from '@/ui/Modal'
import { Tabs, type TabOption } from '@/ui/Tabs'
import { useDraft } from '@/ui/draft'
import { AddressField } from './AddressField'
import { AccountPassword, signerFor } from './Authorize'
import { needsPassword, signsAlone, type Account } from './types'

type Mode = 'sign' | 'verify'

const MODES: TabOption<Mode>[] = [
  { id: 'sign', label: 'Sign' },
  { id: 'verify', label: 'Verify' },
]

/**
 * A signature over words rather than money. Proving an address is yours takes
 * one, and so does the other direction, reading somebody else's.
 *
 * Nothing here reaches the chain. A signed message is not a transaction and
 * never touches a balance, which is what the wrapping in signing/message.ts is
 * for.
 */
export function SignModal({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const [draft, patch] = useDraft('sign', { mode: 'sign' as Mode })
  const tabs = (
    <Tabs value={draft.mode} options={MODES} onChange={(mode) => patch({ mode })} className="w-fit" />
  )

  return draft.mode === 'sign' ? (
    <Sign accounts={accounts} tabs={tabs} onClose={onClose} />
  ) : (
    <Verify accounts={accounts} tabs={tabs} onClose={onClose} />
  )
}

function Sign({
  accounts,
  tabs,
  onClose,
}: {
  accounts: Account[]
  tabs: ReactNode
  onClose: () => void
}) {
  // Only an account holding its own key can put it to anything
  const own = accounts.filter(signsAlone)
  const [signing, setSigning] = useState(own[0]?.address ?? '')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [signature, setSignature] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const account = own.find((entry) => entry.address === signing)

  const sign = () => {
    setError('')
    if (!account) {
      setError('This wallet holds no key that could sign it')
      return false
    }
    if (message === '') {
      setError('Write the message this account is putting its name to')
      return false
    }

    setBusy(true)
    void (async () => {
      try {
        setSignature(await signMessage(signerFor(account, password), message))
      } catch (problem) {
        if (problem instanceof VaultError) setError(problem.message)
        else setError(problem instanceof Error ? problem.message : 'That account would not sign it')
      } finally {
        setBusy(false)
      }
    })()
    return false
  }

  return (
    <Modal
      title="Sign a message"
      submitLabel={busy ? 'Signing…' : 'Sign it'}
      cancelLabel="Close"
      disabled={busy}
      aside={tabs}
      footNote="A signed message proves the account, it moves nothing"
      onClose={onClose}
      onSubmit={sign}
    >
      <AddressField
        label="Signed by"
        value={signing}
        onChange={(next) => {
          setSigning(next)
          setSignature('')
        }}
        accounts={own}
        readOnly
      />

      <Field label="Message">
        <Textarea
          value={message}
          rows={4}
          placeholder="Whatever this account is saying"
          onChange={(event) => {
            setMessage(event.target.value)
            setSignature('')
          }}
        />
      </Field>

      {account && needsPassword(account) && (
        <AccountPassword
          value={password}
          note="Unlocks this account for one signature"
          onChange={setPassword}
        />
      )}
      <FieldError>{error}</FieldError>

      {signature && (
        <>
          <Field
            label="Signature"
            aside={<CopyButton text={signature} label="Copy the signature" spelled />}
          >
            <p className="font-mono text-[12.5px] break-all">{signature}</p>
          </Field>
          <p className="mt-1.5 text-[12.5px] text-dim">
            Whoever you hand this to needs the message and {shorten(signing)} as well, since a
            signature on its own says nothing.
          </p>
        </>
      )}
    </Modal>
  )
}

function Verify({
  accounts,
  tabs,
  onClose,
}: {
  accounts: Account[]
  tabs: ReactNode
  onClose: () => void
}) {
  const [address, setAddress] = useState('')
  const [message, setMessage] = useState('')
  const [signature, setSignature] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [error, setError] = useState('')

  const check = () => {
    setError('')
    setVerdict(null)
    try {
      setVerdict(verifyMessage(address, message, signature.trim()))
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That signature could not be read')
    }
    return false
  }

  return (
    <Modal
      title="Verify a message"
      submitLabel="Check it"
      cancelLabel="Close"
      aside={tabs}
      footNote="Nothing here is sent anywhere, the check happens in this browser"
      onClose={onClose}
      onSubmit={check}
    >
      <AddressField
        label="Signed by"
        value={address}
        onChange={(next) => {
          setAddress(next)
          setVerdict(null)
        }}
        accounts={accounts}
      />

      <Field label="Message">
        <Textarea
          value={message}
          rows={4}
          placeholder="The message, exactly as it was signed"
          onChange={(event) => {
            setMessage(event.target.value)
            setVerdict(null)
          }}
        />
      </Field>

      {/* Two lines, which is what a signature takes at this width, so it wraps
          the way the one on the other tab is shown rather than scrolling away */}
      <Field label="Signature">
        <Textarea
          value={signature}
          rows={2}
          spellCheck={false}
          className="resize-none font-mono text-[12.5px] break-all"
          placeholder="0x…"
          onChange={(event) => {
            setSignature(event.target.value)
            setVerdict(null)
          }}
        />
      </Field>

      <FieldError>{error}</FieldError>

      {verdict && (
        <p className={`mt-3 text-[13.5px] ${verdict.valid ? 'text-good' : 'text-bad'}`}>
          {verdict.valid
            ? `That address signed that message, over ${verdict.crypto}`
            : 'That address did not sign that message'}
        </p>
      )}
    </Modal>
  )
}
