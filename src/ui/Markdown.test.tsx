import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

const PAGE = 'https://github.com/huoji120/numen/blob/master/imges/4.png'
const RAW = 'https://raw.githubusercontent.com/huoji120/numen/master/imges/4.png'

describe('Markdown', () => {
  it('draws an https image', () => {
    render(<Markdown text={`![shot](${RAW})`} />)
    expect(screen.getByRole('img', { name: 'shot' })).toHaveAttribute('src', RAW)
  })

  it('links an image the browser cannot draw, by its alt', () => {
    render(<Markdown text={`![shot](${PAGE})`} />)
    fireEvent.error(screen.getByRole('img', { name: 'shot' }))
    expect(screen.getByRole('link', { name: 'shot' })).toHaveAttribute('href', PAGE)
  })

  it('links an image with no alt by its address', () => {
    const { container } = render(<Markdown text={`![](${PAGE})`} />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByRole('link', { name: PAGE })).toHaveAttribute('href', PAGE)
  })

  it('tries again once the address changes', () => {
    const { rerender } = render(<Markdown text={`![shot](${PAGE})`} />)
    fireEvent.error(screen.getByRole('img', { name: 'shot' }))
    rerender(<Markdown text={`![shot](${RAW})`} />)
    expect(screen.getByRole('img', { name: 'shot' })).toHaveAttribute('src', RAW)
  })

  it('links an image that is not https', () => {
    render(<Markdown text="![plain](http://example.com/plain.png)" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'plain' })).toHaveAttribute('href', 'http://example.com/plain.png')
  })
})
