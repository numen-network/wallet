import { useFacts } from '@/chain/queries'
import { CONVICTIONS, type Conviction } from '@/chain/types'
import { waitFor } from '@/lib/blocks'
import { Field, INSIDE } from '@/ui/Field'
import { Select } from '@/ui/Select'

/**
 * How long each conviction holds the vote for. The lock is a runtime constant,
 * so the labels cannot be written out until the chain has answered.
 */
export function ConvictionField({
  value,
  onChange,
}: {
  value: Conviction
  onChange: (conviction: Conviction) => void
}) {
  const { data: facts } = useFacts()
  const options = CONVICTIONS.map((conviction) => ({
    value: conviction.value,
    label: conviction.periods
      ? `${conviction.weight}, locked ${
          facts
            ? waitFor(conviction.periods * facts.voteLockingPeriod, facts.blockSeconds)
            : 'while it stands'
        }`
      : `${conviction.weight}, no lock`,
  }))

  return (
    <Field label="Conviction">
      <Select
        value={value}
        onValueChange={(next) => onChange(next as Conviction)}
        options={options}
        label="Conviction"
        className={INSIDE}
      />
    </Field>
  )
}
