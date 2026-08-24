import { useState } from 'react'
import { Field, FieldError, Input, Modal } from '@/ui/Modal'
import { IconButton } from '@/ui/Button'
import { TrashIcon } from '@/ui/icons'
import { toast } from '@/ui/Toast'
import { customNetworks } from './custom'
import { useChain } from './provider'

/**
 * Anybody running their own node has nowhere to point the wallet otherwise. The
 * three that ship stay where they are, this only adds to them.
 */
export function EndpointModal({ onClose }: { onClose: () => void }) {
  const { addNetwork, forgetNetwork } = useChain()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [added, setAdded] = useState(customNetworks)

  const submit = () => {
    setError('')

    try {
      addNetwork(name, url)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That endpoint could not be added')
      return false
    }

    toast('Endpoint added')
  }

  const forget = (id: string) => {
    forgetNetwork(id)
    setAdded(customNetworks())
  }

  return (
    <Modal title="Add an endpoint" submitLabel="Add" onClose={onClose} onSubmit={submit}>
      <p className="text-[13.5px] text-lead">
        A node of your own, for this chain. Point it somewhere else and the balances on screen will
        be that chain's, read with Numen's decimals.
      </p>

      <Field label="Address">
        <Input
          className="font-mono"
          value={url}
          placeholder="wss://rpc.example.com"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setUrl(event.target.value)}
        />
      </Field>

      <Field label="Name">
        <Input
          value={name}
          maxLength={40}
          placeholder="From the address"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <FieldError>{error}</FieldError>

      {added.length > 0 && (
        <ul className="mt-3.5 rounded-[6px] border border-line bg-recess">
          {added.map((network) => (
            <li
              key={network.id}
              className="flex items-center gap-2 border-t border-line px-2.5 py-1.5 first:border-t-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{network.name}</span>
                <span className="block truncate font-mono text-[11.5px] text-lead">
                  {network.rpc}
                </span>
              </span>
              <IconButton
                type="button"
                aria-label={`Forget ${network.name}`}
                onClick={() => forget(network.id)}
              >
                <TrashIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
