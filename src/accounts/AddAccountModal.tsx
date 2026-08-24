import { useMemo, useState } from 'react'
import { evmToSubstrate, isEvmAddress, isSubstrateAddress, toNumenAddress } from '@/lib/address'
import { addressOf, newMnemonic, seedOf } from '@/signing/vault'
import { Button } from '@/ui/Button'
import { SyncIcon } from '@/ui/icons'
import { Identicon } from '@/ui/Identicon'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { toast, toastProblem } from '@/ui/Toast'
import { GroupField } from './GroupField'
import { UNGROUPED_ID } from './layout'
import { useAccountsStore } from './store'
import { NoExtensionError } from './useAccounts'
import { AddressField } from './AddressField'

type Kind = 'extension' | 'create' | 'phrase' | 'watch'

const KINDS: Array<{ id: Kind; label: string }> = [
  { id: 'extension', label: 'Browser extension' },
  { id: 'create', label: 'New account' },
  { id: 'phrase', label: 'From seed' },
  { id: 'watch', label: 'Watch only' },
]

/** What each of the two boxes below holds, since one is not the other. */
const LEGEND = 'mt-3 text-[11.5px] font-semibold tracking-[0.06em] text-dim uppercase'

interface AddAccountModalProps {
  connectExtension: () => Promise<number>
  onClose: () => void
}

/**
 * Shown once, and only here. Nothing stores the seed, so a user who does not
 * write it down now cannot get it back from the wallet.
 *
 * Which is why the key itself is stored on Done rather than before this. Leaving
 * this screen any other way loses the seed and the account together, instead
 * of keeping an account whose seed nobody ever read.
 */
function MnemonicNotice({
  mnemonic,
  onDone,
  onClose,
}: {
  mnemonic: string
  onDone: () => boolean | void
  onClose: () => void
}) {
  const [saved, setSaved] = useState(false)
  const seed = useMemo(() => seedOf(mnemonic), [mnemonic])

  return (
    <Modal
      title="Write this down"
      submitLabel="Done"
      cancelLabel={null}
      disabled={!saved}
      onSubmit={onDone}
      onClose={onClose}
    >
      <p className="text-[13.5px] text-lead">
        The secret seed value for this account. Ensure that you keep this in a safe place, with
        access to the seed you can re-create the account.
      </p>

      <p className={LEGEND}>Mnemonic seed</p>
      {/* Ordered, because the words in another order open another account */}
      <ol className="mt-1 grid grid-cols-4 gap-x-2 gap-y-2.5 rounded-[6px] border border-line bg-recess p-3.5">
        {mnemonic.split(' ').map((word, place) => (
          <li key={place} className="text-center text-[15px] font-semibold">
            {word}
          </li>
        ))}
      </ol>

      <p className={LEGEND}>Raw seed</p>
      <p className="mt-1 rounded-[6px] border border-line bg-recess p-3 font-mono text-[12.5px] break-all">
        {seed}
      </p>

      <label className="mt-3.5 flex cursor-pointer items-center gap-2 text-[13.5px]">
        <input
          type="checkbox"
          checked={saved}
          className="accent-accent"
          onChange={(event) => setSaved(event.target.checked)}
        />
        I have written the seed down somewhere safe
      </label>
    </Modal>
  )
}

export function AddAccountModal({ connectExtension, onClose }: AddAccountModalProps) {
  const addWatch = useAccountsStore((s) => s.addWatch)
  const moveAccount = useAccountsStore((s) => s.moveAccount)
  const importSuri = useAccountsStore((s) => s.importSuri)

  const [kind, setKind] = useState<Kind>('extension')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phrase, setPhrase] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [groupId, setGroupId] = useState(UNGROUPED_ID)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mnemonic, setMnemonic] = useState('')

  // The phrase a new key would get, so its face can be seen before it exists
  const [draft, setDraft] = useState(newMnemonic)
  const draftAddress = useMemo(() => addressOf(draft), [draft])

  const place = (created: string) => moveAccount(created, groupId, Number.MAX_SAFE_INTEGER)

  const importFromExtension = async () => {
    setBusy(true)
    try {
      const count = await connectExtension()
      toast(count ? `${count} account${count > 1 ? 's' : ''} imported` : 'The extension shared no accounts')
      onClose()
    } catch (problem) {
      setError(
        problem instanceof NoExtensionError
          ? 'No signing extension found. Install one and reload the page.'
          : 'The extension refused the connection',
      )
    } finally {
      setBusy(false)
    }
  }

  const addWatchAccount = () => {
    const input = address.trim()
    const evm = isEvmAddress(input)

    if (!evm && !isSubstrateAddress(input)) {
      setError('Enter a Numen or EVM address')
      return false
    }

    const entry = {
      address: evm ? evmToSubstrate(input) : toNumenAddress(input),
      evmAddress: evm ? input : null,
      name: name.trim() || 'Watched account',
    }

    addWatch(entry)
    place(entry.address)
    toast('Watch account added')
    return true
  }

  const passwordProblem = () => {
    if (!password) return 'Set a password. An empty one stores the account unencrypted'
    if (password !== repeat) return 'The two passwords do not match'
    return ''
  }

  const createLocalKey = () => {
    const problem = passwordProblem()
    if (problem) {
      setError(problem)
      return false
    }

    setMnemonic(draft)
    return false
  }

  const storeLocalKey = () => {
    try {
      place(importSuri(name.trim() || 'Local account', draft, password))
    } catch (problem) {
      toastProblem(problem instanceof Error ? problem.message : 'That account could not be stored')
      return false
    }
    toast('Account created')
  }

  const importPhrase = () => {
    const problem = passwordProblem()
    if (problem) {
      setError(problem)
      return false
    }

    try {
      place(importSuri(name.trim() || 'Local account', phrase, password))
      toast('Account imported')
      return true
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That seed could not be read')
      return false
    }
  }

  const submit = () => {
    setError('')
    if (kind === 'extension') {
      void importFromExtension()
      return false
    }
    if (kind === 'watch') return addWatchAccount() ? undefined : false
    if (kind === 'create') return createLocalKey()
    return importPhrase() ? undefined : false
  }

  if (mnemonic) {
    return <MnemonicNotice mnemonic={mnemonic} onDone={storeLocalKey} onClose={onClose} />
  }

  const nameField = (
    <Field label="Name">
      <Input
        value={name}
        maxLength={40}
        placeholder={kind === 'watch' ? 'Watched account' : 'Local account'}
        onChange={(event) => setName(event.target.value)}
      />
    </Field>
  )

  const passwordFields = (
    <>
      <Field label="Password">
        <Input
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Field label="Repeat password">
        <Input
          type="password"
          value={repeat}
          autoComplete="new-password"
          onChange={(event) => setRepeat(event.target.value)}
        />
      </Field>
    </>
  )

  return (
    <Modal
      title="Add account"
      submitLabel={kind === 'extension' ? 'Connect' : kind === 'create' ? 'Create' : 'Add'}
      disabled={busy}
      onClose={onClose}
      onSubmit={submit}
    >
      <fieldset>
        <legend className="mb-1.5 text-[11px] font-bold tracking-[0.07em] text-lead uppercase">
          Source
        </legend>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
          {KINDS.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-1.5 text-[13.5px]"
            >
              <input
                type="radio"
                name="kind"
                value={option.id}
                checked={kind === option.id}
                className="accent-accent"
                onChange={() => setKind(option.id)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === 'extension' && (
        <p className="mt-3.5 text-[13.5px] text-lead">
          Your extension holds the keys and signs every transfer. The wallet only ever sees the
          addresses it hands over.
        </p>
      )}

      {kind === 'create' && (
        <>
          {nameField}
          <div className="mt-3.5 flex items-center gap-2.5 rounded-[6px] border border-line bg-recess p-2.5">
            <Identicon address={draftAddress} />
            <span className="min-w-0 flex-1 font-mono text-[12.5px] break-all">{draftAddress}</span>
            <Button type="button" onClick={() => setDraft(newMnemonic())}>
              <SyncIcon />
              Reroll
            </Button>
          </div>
          {passwordFields}
          <GroupField value={groupId} onChange={setGroupId} />
          <p className="mt-3 text-[12.5px] text-dim">
            The account is kept in this browser, encrypted with this password. Losing both the
            password and the seed loses it.
          </p>
        </>
      )}

      {kind === 'phrase' && (
        <>
          <Field label="Seed">
            <Input
              className="font-mono"
              value={phrase}
              placeholder="twelve words, or a seed and //path"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setPhrase(event.target.value)}
            />
          </Field>
          {nameField}
          {passwordFields}
          <GroupField value={groupId} onChange={setGroupId} />
        </>
      )}

      {kind === 'watch' && (
        <>
          {nameField}
          {/* Nothing to offer, since an account this wallet already holds is
              not one worth watching */}
          <AddressField label="Address" value={address} onChange={setAddress} accounts={[]} />
          <GroupField value={groupId} onChange={setGroupId} />
        </>
      )}

      <FieldError>{error}</FieldError>
    </Modal>
  )
}
