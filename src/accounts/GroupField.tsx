import { Field, INSIDE } from '@/ui/Modal'
import { Select } from '@/ui/Select'
import { useAccountsStore } from './store'

/** Where a newly added account lands. Every add flow offers the same choice. */
export function GroupField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const groups = useAccountsStore((s) => s.layout.groups)

  return (
    <Field label="Group">
      <Select
        value={value}
        onValueChange={onChange}
        options={groups.map((group) => ({ value: group.id, label: group.name }))}
        label="Group"
        className={INSIDE}
      />
    </Field>
  )
}
