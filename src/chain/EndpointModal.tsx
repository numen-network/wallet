import { Fragment, useState } from 'react'
import { LEDE, Modal } from '@/ui/Modal'
import { Field } from '@/ui/Field'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item'
import { Trash2 } from 'lucide-react'
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
      <p className={LEDE}>
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
        <ItemGroup variant="outline" className="mt-3.5 bg-muted">
          {added.map((network, index) => (
            <Fragment key={network.id}>
              {index > 0 && <ItemSeparator />}
              <Item>
                <ItemContent>
                  <ItemTitle>{network.name}</ItemTitle>
                  <ItemDescription className="font-mono">{network.rpc}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Forget ${network.name}`}
                    onClick={() => forget(network.id)}
                  >
                    <Trash2 />
                  </Button>
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </Modal>
  )
}
