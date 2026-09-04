import {
  byteLength,
  LABELS,
  MAX_BYTES,
  PLACEHOLDERS,
  type IdentityField,
} from '@/chain/identity'
import { Field } from '@/ui/Field'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

/**
 * One field of an identity, with the only rule the chain has about it. Kept out
 * of the dialogs that use it because building it inside one would make it a new
 * component type on every render, and React would tear the input down and put a
 * fresh one up after each keystroke. The cursor would be gone by the second
 * letter.
 */
export function IdentityLine({
  field,
  value,
  onChange,
}: {
  field: IdentityField
  value: string
  onChange: (value: string) => void
}) {
  const bytes = byteLength(value)
  const max = MAX_BYTES[field]
  const box = { value, placeholder: PLACEHOLDERS[field], autoComplete: 'off' }

  return (
    <Field label={LABELS[field]}>
      {field === 'bio' ? (
        <Textarea {...box} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input {...box} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
      )}
      {bytes > max && (
        <FieldError>
          {bytes} bytes, {max} is the most the chain holds
        </FieldError>
      )}
    </Field>
  )
}
