import type { ReactNode } from 'react'
import { Tabs as Root, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { CONTROL } from './shell'

export interface TabOption<T extends string> {
  id: T
  label: string
  /** Left out when there is nothing to count, so an empty tab reads as a plain word. */
  count?: number
}

/**
 * Which page is up. The strip and the panels go anywhere inside, so a dialog
 * can keep the strip in its title row with the panel underneath.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  children,
}: {
  value: T
  onChange: (value: T) => void
  children: ReactNode
}) {
  return (
    <Root value={value} activationMode="manual" onValueChange={(next) => onChange(next as T)}>
      {children}
    </Root>
  )
}

/** A pill switch for a handful of exclusive choices, where a select would hide them. */
export function TabBar<T extends string>({
  options,
  className,
}: {
  options: readonly TabOption<T>[]
  className?: string
}) {
  return (
    <TabsList className={cn(CONTROL, 'no-scrollbar overflow-x-auto', className)}>
      {options.map((option) => (
        <TabsTrigger key={option.id} value={option.id}>
          {option.label}
          {option.count ? <span className="pl-1.5 opacity-55">{option.count}</span> : null}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}

export { TabsContent as TabPanel }
