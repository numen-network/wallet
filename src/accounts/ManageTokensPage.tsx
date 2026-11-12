import { Fragment, useId, useState } from 'react'
import { useChain } from '@/chain/provider'
import { useAllTokens, useListedTokens } from '@/chain/queries'
import type { Token } from '@/chain/types'
import { shorten } from '@/lib/address'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty } from '@/components/ui/empty'
import { Field as Row, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
import { Switch } from '@/components/ui/switch'
import { Field } from '@/ui/Field'
import { LEDE, ModalPage } from '@/ui/Modal'
import { TokenMark } from './TokenMark'
import { useImported, useImportedStore } from './tokens'

/** The listed tokens, then every other ERC20 on chain by symbol. Undefined until both are read. */
function useEveryToken(): Token[] | undefined {
  const { data: listed } = useListedTokens()
  const { data: all } = useAllTokens()
  if (!listed || !all) return undefined

  const known = new Set(listed.map((token) => token.address))
  const others = all
    .filter((token) => !known.has(token.address))
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
  return [...listed, ...others]
}

/**
 * Every token on chain, with a switch for each one the wallet doesn't list.
 * A switch covers every account.
 */
export function ManageTokensPage({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const { network } = useChain()
  const add = useImportedStore((state) => state.add)
  const remove = useImportedStore((state) => state.remove)
  const { data: listed } = useListedTokens()
  const imported = useImported()
  const tokens = useEveryToken()
  const [search, setSearch] = useState('')
  const [onOnly, setOnOnly] = useState(false)
  const onOnlyId = useId()

  const builtIn = new Set(listed?.map((token) => token.address))
  const needle = search.trim().toLowerCase()
  const shown = tokens?.filter(
    (token) =>
      (!onOnly || builtIn.has(token.address) || imported.includes(token.address)) &&
      (token.symbol.toLowerCase().includes(needle) ||
        token.name.toLowerCase().includes(needle) ||
        token.address.includes(needle)),
  )

  return (
    <ModalPage
      title="Manage tokens"
      submitLabel="Done"
      cancelLabel={null}
      onClose={onClose}
      onSubmit={() => {
        onBack()
        return false
      }}
      aside={
        <Row orientation="horizontal" className="w-fit gap-1.5">
          <Checkbox
            id={onOnlyId}
            checked={onOnly}
            onCheckedChange={(checked) => setOnOnly(checked === true)}
          />
          <FieldLabel htmlFor={onOnlyId}>Turned on only</FieldLabel>
        </Row>
      }
    >
      <p className={LEDE}>
        Every token on this chain. Tokens you turn on show on all your accounts.
      </p>
      <Field label="Search" className="mt-2.5">
        <Input
          value={search}
          spellCheck={false}
          placeholder="Symbol, name or 0x address"
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>

      {!shown?.length ? (
        <Empty className="mt-2.5 p-6">{shown ? 'No tokens match.' : 'Reading the chain…'}</Empty>
      ) : (
        <ItemGroup variant="outline" className="mt-2.5 max-h-80 overflow-auto bg-muted">
          {shown.map((token, index) => (
            <Fragment key={token.address}>
              {index > 0 && <ItemSeparator />}
              <Item className="flex-wrap">
                <ItemMedia>
                  <TokenMark token={token} />
                </ItemMedia>
                <ItemContent className="min-w-44">
                  <ItemTitle>
                    {token.symbol}
                    <span className="ml-1.5 font-normal text-muted-foreground">{token.name}</span>
                  </ItemTitle>
                  <ItemDescription className="font-mono">{shorten(token.address)}</ItemDescription>
                </ItemContent>
                <ItemActions className="ml-auto">
                  {builtIn.has(token.address) ? (
                    <Badge variant="muted">Listed</Badge>
                  ) : (
                    <Switch
                      aria-label={`Show ${token.symbol}`}
                      checked={imported.includes(token.address)}
                      onCheckedChange={(checked) =>
                        (checked ? add : remove)(network.id, token.address)
                      }
                    />
                  )}
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      )}

      <p className="mt-2.5 text-[12.5px] text-destructive">
        Anyone can deploy a token under any name. Only turn on contracts you trust.
      </p>
    </ModalPage>
  )
}
