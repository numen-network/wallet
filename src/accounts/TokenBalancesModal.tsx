import { Fragment, useState } from 'react'
import { explorerToken } from '@/chain/config'
import { useChain } from '@/chain/provider'
import { shorten } from '@/lib/address'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item'
import { ExternalLink, Plus, QrCode, Send, X } from 'lucide-react'
import type { Holding, Token } from '@/chain/types'
import { CopyButton } from '@/ui/CopyButton'
import { ModalFrame, ModalPage } from '@/ui/Modal'
import { Tip } from '@/ui/Tip'
import { AddressField } from './AddressField'
import { ImportTokenPage } from './ImportTokenPage'
import { TokenMark } from './TokenMark'
import { tokenAmount, useHoldings, useImported, useImportedStore } from './tokens'
import type { Account } from './types'

/** What an EVM account holds of the tokens the wallet shows. Its card leaves them out. */
export function TokenBalancesModal({
  account,
  source,
  onSend,
  onReceive,
  onClose,
}: {
  account: Account
  /** The account's H160, the only kind of address a token sits with. */
  source: string
  onSend: (holding: Holding) => void
  onReceive: (token: Token) => void
  onClose: () => void
}) {
  const { network } = useChain()
  const holdings = useHoldings(source)
  const imported = useImported()
  const remove = useImportedStore((state) => state.remove)
  const [importing, setImporting] = useState(false)

  return (
    <ModalFrame onClose={onClose}>
      {importing ? (
        <ImportTokenPage holder={source} onBack={() => setImporting(false)} onClose={onClose} />
      ) : (
        <ModalPage
          title="Token balances"
          submitLabel="Done"
          cancelLabel={null}
          onClose={onClose}
          aside={
            <Button type="button" variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Plus />
              Import token
            </Button>
          }
        >
          <AddressField
            label="Account"
            value={source}
            onChange={() => {}}
            accounts={[{ address: source, name: account.name }]}
            evm
            readOnly
          />

          {!holdings?.length ? (
            <Empty className="mt-2.5 p-6">
              {holdings
                ? `${account.name} holds none of the tokens the wallet shows.`
                : 'Reading the chain…'}
            </Empty>
          ) : (
            <ItemGroup variant="outline" className="mt-2.5 overflow-x-auto bg-muted">
              {holdings.map((holding, index) => {
                const { token } = holding
                const added = imported.includes(token.address)
                return (
                  <Fragment key={token.address}>
                    {index > 0 && <ItemSeparator />}
                    <Item className="flex-wrap">
                      <ItemMedia>
                        <TokenMark token={token} />
                      </ItemMedia>
                      <ItemContent className="min-w-44">
                        <ItemTitle>
                          {token.symbol}
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            {token.name}
                          </span>
                        </ItemTitle>
                        <ItemDescription className="flex items-center gap-1.5 font-mono">
                          {shorten(token.address)}
                          <CopyButton text={token.address} label="Copy contract address" />
                          <Tip text="View on the explorer">
                            <Button asChild variant="plain" size="icon-xs">
                              <a
                                href={explorerToken(network, token.address)}
                                target="_blank"
                                rel="noopener"
                                aria-label="View on the explorer"
                              >
                                <ExternalLink />
                              </a>
                            </Button>
                          </Tip>
                          {added && <Badge variant="muted">Imported</Badge>}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="ml-auto whitespace-nowrap">
                        <span className="mr-1 font-mono text-[13.5px] font-semibold">
                          {tokenAmount(holding)}
                        </span>
                        <Tip text={`Send ${token.symbol}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Send ${token.symbol}`}
                            onClick={() => onSend(holding)}
                          >
                            <Send />
                          </Button>
                        </Tip>
                        <Tip text={`Receive ${token.symbol}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Receive ${token.symbol}`}
                            onClick={() => onReceive(token)}
                          >
                            <QrCode />
                          </Button>
                        </Tip>
                        {added && (
                          <Tip text={`Remove ${token.symbol} from the list`}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${token.symbol}`}
                              onClick={() => remove(network.id, token.address)}
                            >
                              <X />
                            </Button>
                          </Tip>
                        )}
                      </ItemActions>
                    </Item>
                  </Fragment>
                )
              })}
            </ItemGroup>
          )}
        </ModalPage>
      )}
    </ModalFrame>
  )
}
