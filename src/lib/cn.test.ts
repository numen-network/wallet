import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('which of two utilities on one property wins', () => {
  it('takes the later colour, whether the name comes from shadcn or the wallet', () => {
    expect(cn('bg-card', 'bg-muted')).toBe('bg-muted')
    expect(cn('border-border', 'border-input')).toBe('border-input')
    expect(cn('text-dim', 'text-warn-deep')).toBe('text-warn-deep')
    expect(cn('bg-primary-soft', 'bg-primary-hover')).toBe('bg-primary-hover')
    expect(cn('accent-primary', 'accent-good')).toBe('accent-good')
  })

  it('takes the later size, which is how a caller asks for a smaller control', () => {
    expect(cn('px-3.5 py-[7px]', 'px-2.5 py-1')).toBe('px-2.5 py-1')
    expect(cn('text-[13.5px]', 'text-[12.5px]')).toBe('text-[12.5px]')
    expect(cn('rounded-[4px]', 'rounded-[6px]')).toBe('rounded-[6px]')
  })

  it('takes the later shadow across both scales, since the wallet named three of its own', () => {
    expect(cn('shadow-card', 'shadow-lift')).toBe('shadow-lift')
    expect(cn('shadow-card', 'shadow-lg')).toBe('shadow-lg')
    expect(cn('shadow-lg', 'shadow-hover')).toBe('shadow-hover')
  })
})

describe('what survives untouched', () => {
  it('keeps a variant, which paints the property in another state', () => {
    expect(cn('bg-card', 'hover:bg-accent')).toBe('bg-card hover:bg-accent')
    expect(cn('hover:bg-accent', 'hover:bg-primary')).toBe('hover:bg-primary')
  })

  it('keeps utilities that never meet', () => {
    expect(cn('bg-card', 'text-foreground')).toBe('bg-card text-foreground')
    expect(cn('text-[15px]', 'text-muted-foreground')).toBe('text-[15px] text-muted-foreground')
    expect(cn('border', 'border-input')).toBe('border border-input')
  })
})
