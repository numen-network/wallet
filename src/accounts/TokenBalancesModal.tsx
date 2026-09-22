import { Fragment } from 'react'
import { explorerToken } from '@/chain/config'
import { useChain } from '@/chain/provider'
import { shorten } from '@/lib/address'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
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
import { ExternalLink, QrCode, Send } from 'lucide-react'
import type { Token } from '@/chain/types'
import { CopyButton } from '@/ui/CopyButton'
import { Modal } from '@/ui/Modal'
import { Tip } from '@/ui/Tip'
import { AddressField } from './AddressField'
import { tokenAmount, useHoldings, type Holding } from './tokens'
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

  return (
    <Modal title="Token balances" submitLabel="Done" cancelLabel={null} onClose={onClose}>
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
          {holdings.map((holding, index) => (
            <Fragment key={holding.token.address}>
              {index > 0 && <ItemSeparator />}
              <Item>
                <ItemMedia>
                  <Avatar>
                    <AvatarImage src={holding.token.icon} alt="" />
                  </Avatar>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {holding.token.symbol}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {holding.token.name}
                    </span>
                  </ItemTitle>
                  <ItemDescription className="flex items-center gap-1.5 font-mono">
                    {shorten(holding.token.address, { evm: true })}
                    <CopyButton text={holding.token.address} label="Copy contract address" />
                    <Tip text="View on the explorer">
                      <Button asChild variant="plain" size="icon-xs">
                        <a
                          href={explorerToken(network, holding.token.address)}
                          target="_blank"
                          rel="noopener"
                          aria-label="View on the explorer"
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                    </Tip>
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="whitespace-nowrap">
                  <span className="mr-1 font-mono text-[13.5px] font-semibold">
                    {tokenAmount(holding)}
                  </span>
                  <Tip text={`Send ${holding.token.symbol}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Send ${holding.token.symbol}`}
                      onClick={() => onSend(holding)}
                    >
                      <Send />
                    </Button>
                  </Tip>
                  <Tip text={`Receive ${holding.token.symbol}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Receive ${holding.token.symbol}`}
                      onClick={() => onReceive(holding.token)}
                    >
                      <QrCode />
                    </Button>
                  </Tip>
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      )}
    </Modal>
  )
}
