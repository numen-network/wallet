import { useId, useState, type ReactNode } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field as Box, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'
import { BOX } from './Field'
import { Markdown } from './Markdown'
import { Modal } from './Modal'
import { TabBar, TabPanel, Tabs } from './Tabs'

type Mode = 'write' | 'preview'

const MODES = [
  { id: 'write', label: 'Write' },
  { id: 'preview', label: 'Preview' },
] as const

const PILLS = 'h-6 [&>button]:px-2 [&>button]:text-[11px]'

interface Props {
  label: string
  /** The cost of what is typed, shown beside the label and in the editor's footer. */
  aside?: ReactNode
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

function Rendered({ value }: { value: string }) {
  if (!value.trim()) return <p className="text-[15px] text-hint">Nothing to preview</p>
  return <Markdown text={value} />
}

/** Side by side where there is room, the same two tabs where there is not. */
function Editor({ label, aside, value, placeholder, onChange, onClose }: Props & { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('write')
  const panel = 'min-h-0 flex-1 overflow-y-auto data-[state=inactive]:max-[899px]:hidden'

  return (
    <Tabs value={mode} onChange={setMode}>
      <Modal
        title={label}
        width={1200}
        submitLabel={null}
        cancelLabel="Done"
        onClose={onClose}
        fee={aside}
        aside={<TabBar options={MODES} className={cn(PILLS, 'min-[900px]:hidden')} />}
      >
        <div className="flex h-[calc(100dvh-220px)] gap-3">
          <TabPanel value="write" forceMount className={cn(BOX, panel, 'flex')}>
            <Textarea
              aria-label={label}
              value={value}
              placeholder={placeholder}
              autoFocus
              className="h-full resize-none"
              onChange={(event) => onChange(event.target.value)}
            />
          </TabPanel>
          <TabPanel value="preview" forceMount className={cn(BOX, panel, 'block bg-card')}>
            <Rendered value={value} />
          </TabPanel>
        </div>
      </Modal>
    </Tabs>
  )
}

/**
 * A textarea for text the explorer renders as markdown. The editor opens over
 * the dialog and writes straight into the same value, so closing it never
 * throws a long draft away.
 */
export function MarkdownField({
  rows,
  children,
  ...props
}: Props & {
  rows: number
  /** The field's error line, inside the box like any other field's. */
  children?: ReactNode
}) {
  const { label, aside, value, placeholder, onChange } = props
  const id = useId()
  const [mode, setMode] = useState<Mode>('write')
  const [editing, setEditing] = useState(false)

  // Not a label around the whole box like other fields, since a label names the
  // first control inside it and here that would be the Write tab
  return (
    <div className="mt-2.5 first:mt-0">
      <Tabs value={mode} onChange={setMode}>
        <Box className={BOX}>
          <FieldTitle className="flex-wrap gap-y-1">
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <span className="ml-auto flex min-w-0 items-center gap-1.5">
              {aside && <span className="mr-1 truncate">{aside}</span>}
              <TabBar options={MODES} className={PILLS} />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Expand editor"
                onClick={() => setEditing(true)}
              >
                <Maximize2 />
              </Button>
            </span>
          </FieldTitle>
          <TabPanel value="write">
            <Textarea
              id={id}
              value={value}
              rows={rows}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          </TabPanel>
          <TabPanel value="preview">
            <div className="text-[15px]" style={{ minHeight: `${rows * 1.5}em` }}>
              <Rendered value={value} />
            </div>
          </TabPanel>
          {children}
        </Box>
      </Tabs>
      {editing && <Editor {...props} onClose={() => setEditing(false)} />}
    </div>
  )
}
