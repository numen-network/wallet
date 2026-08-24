import { useMemo } from 'react'
import encodeQR from 'qr'

/**
 * Fixed black on white whatever the theme is. A dark mode QR code that a phone
 * camera cannot read is a decoration, not an address.
 */
/** Kept out here so whatever stands in for a code takes up the same room. */
export const QR_SIZE = 132

export function Qr({ text, size = QR_SIZE }: { text: string; size?: number }) {
  const { modules, path } = useMemo(() => {
    const matrix = encodeQR(text, 'raw', { border: 4 })
    return {
      modules: matrix.length,
      path: matrix
        .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : '')))
        .join(''),
    }
  }, [text])

  return (
    <svg
      viewBox={`0 0 ${modules} ${modules}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${text}`}
    >
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={path} fill="#15181a" />
    </svg>
  )
}
