import type { ReactNode } from 'react'
import { DECIMALS } from '@/chain/config'
import { useSymbol } from '@/chain/queries'
import { amountInput, formatAmount } from '@/lib/balance'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Field } from '@/ui/Field'

/**
 * A box for an amount, with the ticker on its right so the unit is never in
 * doubt. Typing is filtered to what parseAmount takes, and MAX fills in the
 * most the form will take, when the caller says what that is.
 */
export function AmountField({
  label,
  value,
  onChange,
  max,
  aside,
  disabled = false,
  labelled = true,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  /** The most the form will take, which MAX fills in. */
  max?: bigint | undefined
  aside?: ReactNode
  disabled?: boolean
  /** Off in a table, where the column heading has already said it once. */
  labelled?: boolean
}) {
  const symbol = useSymbol()

  const box = (
    <InputGroup>
      <InputGroupInput
        className="font-mono"
        value={value}
        inputMode="decimal"
        placeholder="0.0"
        autoComplete="off"
        aria-label={labelled ? undefined : label}
        disabled={disabled}
        onChange={(event) => onChange(amountInput(event.target.value))}
      />
      <InputGroupAddon>
        {max !== undefined && (
          <InputGroupButton
            disabled={disabled || max === 0n}
            onClick={() =>
              onChange(formatAmount(max, { precision: DECIMALS, grouped: false, pad: false }))
            }
          >
            MAX
          </InputGroupButton>
        )}
        <InputGroupText>{symbol}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )

  if (!labelled) return <Field>{box}</Field>

  return (
    <Field label={label} aside={aside}>
      {box}
    </Field>
  )
}
