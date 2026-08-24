import { beforeAll, describe, expect, it } from 'vitest'
import { Keyring } from '@polkadot/keyring'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { u8aToHex, u8aWrapBytes } from '@polkadot/util'
import { getPolkadotSigner } from 'polkadot-api/signer'
import { toNumenAddress } from '@/lib/address'
import type { WalletAccount } from './types'
import { signMessage, verifyMessage } from './message'

const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'
const MESSAGE = 'I am the treasury account and this is my address'

let alice: WalletAccount
let bob: string

beforeAll(async () => {
  await cryptoWaitReady()
  const ring = new Keyring({ type: 'sr25519' })
  const pair = ring.addFromUri(`${PHRASE}//Alice`)
  alice = {
    address: toNumenAddress(pair.address),
    label: 'Alice',
    source: 'keystore',
    signer: getPolkadotSigner(pair.publicKey, 'Sr25519', (input) => pair.sign(input)),
  }
  bob = toNumenAddress(ring.addFromUri(`${PHRASE}//Bob`).address)
})

describe('signing a message', () => {
  it('reads back as that account over that message', async () => {
    const signature = await signMessage(alice, MESSAGE)

    expect(verifyMessage(alice.address, MESSAGE, signature)).toEqual({
      valid: true,
      crypto: 'sr25519',
    })
  })

  it('refuses the same signature over a message somebody edited', async () => {
    const signature = await signMessage(alice, MESSAGE)

    expect(verifyMessage(alice.address, `${MESSAGE}!`, signature).valid).toBe(false)
  })

  it('refuses it against anybody else', async () => {
    const signature = await signMessage(alice, MESSAGE)

    expect(verifyMessage(bob, MESSAGE, signature).valid).toBe(false)
  })

  /**
   * The tags are what keep a message somebody was talked into signing from
   * also being a transaction that spends their balance.
   */
  it('wraps what it signs', async () => {
    const signature = await signMessage(alice, MESSAGE)
    const bare = u8aToHex(
      await alice.signer.signBytes(new TextEncoder().encode(MESSAGE)),
    )

    expect(signature).not.toBe(bare)
    expect(verifyMessage(alice.address, u8aToHex(u8aWrapBytes(new TextEncoder().encode(MESSAGE))), signature).valid)
      .toBe(false)
  })

  /** A signature made elsewhere may arrive without the tags. */
  it('takes one that was never wrapped', async () => {
    const bare = u8aToHex(await alice.signer.signBytes(new TextEncoder().encode(MESSAGE)))

    expect(verifyMessage(alice.address, MESSAGE, bare).valid).toBe(true)
  })
})

describe('what it refuses to even look at', () => {
  it('says so when the signature is not hex', () => {
    expect(() => verifyMessage(bob, MESSAGE, 'not a signature')).toThrow(/hex/)
  })

  it('says so when the signature is the wrong length', () => {
    expect(() => verifyMessage(bob, MESSAGE, '0x1234')).toThrow(/64 bytes/)
  })

  it('says so when the address is not one', async () => {
    const signature = await signMessage(alice, MESSAGE)

    expect(() => verifyMessage('hello', MESSAGE, signature)).toThrow(/not an address/)
  })
})
