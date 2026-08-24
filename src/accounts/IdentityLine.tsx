import {
  byteLength,
  FIELD_MAX_BYTES,
  LABELS,
  PLACEHOLDERS,
  type IdentityField,
} from '@/chain/identity'
import { Field, FieldError, Input } from '@/ui/Modal'

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

  return (
    <Field label={LABELS[field]}>
      <Input
        value={value}
        placeholder={PLACEHOLDERS[field]}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {bytes > FIELD_MAX_BYTES && (
        <FieldError>
          {bytes} bytes, {FIELD_MAX_BYTES} is the most the chain holds
        </FieldError>
      )}
    </Field>
  )
}
