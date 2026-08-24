import '@testing-library/jest-dom/vitest'

/**
 * jsdom hands out a TextEncoder whose Uint8Array comes from another realm, so
 * `value instanceof Uint8Array` is false for everything it produces and the
 * SS58 codec silently computes the wrong checksum. Copying the bytes into the
 * environment's own Uint8Array lines the two up again. Browsers have one realm
 * and never hit this.
 */
class RealmSafeTextEncoder extends TextEncoder {
  override encode(input?: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(super.encode(input))
  }
}

globalThis.TextEncoder = RealmSafeTextEncoder
