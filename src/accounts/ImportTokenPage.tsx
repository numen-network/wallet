import { Fragment, useState } from 'react'
import { useChain } from '@/chain/provider'
import { useDiscoveredTokens, useToken, useTokenBalances } from '@/chain/queries'
import type { Token } from '@/chain/types'
import { isEvmAddress, shorten } from '@/lib/address'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { FieldError } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
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
import { Field } from '@/ui/Field'
import { LEDE, ModalPage } from '@/ui/Modal'
import { TokenMark } from './TokenMark'
import { tokenAmount, useImportedStore, useTokenList } from './tokens'

/**
 * Tokens the holder has that the wallet doesn't show yet, found by asking every
 * contract on chain, plus a box for a contract the holder has none of.
 */
export function ImportTokenPage({
  holder,
  onBack,
  onClose,
}: {
  holder: string
  onBack: () => void
  onClose: () => void
}) {
  const { network } = useChain()
  const add = useImportedStore((state) => state.add)
  const shown = useTokenList()
  const { data: discovered } = useDiscoveredTokens(holder)
  const [input, setInput] = useState('')

  const known = new Set(shown?.map((token) => token.address))
  const found = discovered?.filter((holding) => !known.has(holding.token.address))
  const typed = input.trim().toLowerCase()
  const address = isEvmAddress(typed) ? typed : null
  const listed = address !== null && known.has(address)
  const { data: token, isError, isFetching } = useToken(listed ? null : address)

  const problem =
    typed && !address
      ? 'Enter a 0x contract address'
      : listed
        ? 'Already in the list'
        : isError
          ? 'No ERC20 at this address'
          : ''

  const importTyped = () => {
    if (!token) return
    add(network.id, token.address)
    setInput('')
  }

  return (
    <ModalPage
      title="Import token"
      submitLabel="Done"
      cancelLabel={null}
      onClose={onClose}
      onSubmit={() => {
        onBack()
        return false
      }}
    >
      <p className={LEDE}>Tokens this account holds that the wallet doesn't list.</p>
      {!found?.length ? (
        <Empty className="mt-2.5 p-6">
          {found ? 'Nothing else on this account.' : 'Reading the chain…'}
        </Empty>
      ) : (
        <ItemGroup variant="outline" className="mt-2.5 overflow-x-auto bg-muted">
          {found.map((holding, index) => (
            <Fragment key={holding.token.address}>
              {index > 0 && <ItemSeparator />}
              <Item className="flex-wrap">
                <ItemMedia>
                  <TokenMark token={holding.token} />
                </ItemMedia>
                <TokenTitle token={holding.token} detail={shorten(holding.token.address)} />
                <ItemActions className="ml-auto whitespace-nowrap">
                  <span className="mr-1 font-mono text-[13.5px] font-semibold">
                    {tokenAmount(holding)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Import ${holding.token.symbol}`}
                    onClick={() => add(network.id, holding.token.address)}
                  >
                    Import
                  </Button>
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      )}

      <Field label="Or paste a contract address" className="mt-3.5">
        <InputGroup>
          <InputGroupInput
            value={input}
            spellCheck={false}
            placeholder="0x…"
            className="font-mono"
            onChange={(event) => setInput(event.target.value)}
          />
          <InputGroupAddon>
            <InputGroupButton disabled={!token || isFetching} onClick={importTyped}>
              Import
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      <FieldError>{problem}</FieldError>

      {token && (
        <ItemGroup variant="outline" className="mt-2.5 overflow-x-auto bg-muted">
          <Item className="flex-wrap">
            <ItemMedia>
              <TokenMark token={token} />
            </ItemMedia>
            <TokenTitle token={token} detail={`${token.decimals} decimals`} />
            <ItemActions className="ml-auto font-mono text-[13.5px] font-semibold whitespace-nowrap">
              <HeldBalance token={token} holder={holder} />
            </ItemActions>
          </Item>
        </ItemGroup>
      )}

      <p className="mt-2.5 text-[12.5px] text-destructive">
        Anyone can deploy a token under any name. Import only a contract you trust.
      </p>
    </ModalPage>
  )
}

function TokenTitle({ token, detail }: { token: Token; detail: string }) {
  return (
    <ItemContent className="min-w-44">
      <ItemTitle>
        {token.symbol}
        <span className="ml-1.5 font-normal text-muted-foreground">{token.name}</span>
      </ItemTitle>
      <ItemDescription className="font-mono">{detail}</ItemDescription>
    </ItemContent>
  )
}

function HeldBalance({ token, holder }: { token: Token; holder: string }) {
  const balance = useTokenBalances(holder, [token.address])[token.address]
  return balance === undefined ? '…' : tokenAmount({ token, balance })
}
