import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { stringToU8a, u8aConcat } from '@polkadot/util'
import { cryptoWaitReady, decodeAddress, sr25519Verify } from '@polkadot/util-crypto'
import { toNumenAddress } from '@/lib/address'
import {
  addressOf,
  changePassword,
  deriveKey,
  exportKey,
  hasKey,
  importJson,
  importSuri,
  listKeys,
  newMnemonic,
  removeKey,
  unlockKey,
  VaultError,
  verifyPassword,
} from './vault'

/** The stock Substrate development phrase, so the addresses below are checkable. */
const DEV_PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'
const ALICE_NUMEN = 'nu7SVAyQhPoGBJfFg7di66oYTV2KVBBeCw3Gt9qTRE2zpSUyb'
const ALICE_GENERIC = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

beforeAll(async () => {
  await cryptoWaitReady()
})

beforeEach(() => localStorage.clear())

/** A brand new key, which is a generated phrase handed straight to the vault. */
const newKey = (name = 'Vault', password = 'correct horse battery') =>
  importSuri(name, newMnemonic(), password)

describe('creating a key', () => {
  it('files it under a Numen address', () => {
    const address = newKey()
    expect(listKeys()).toEqual([{ address, name: 'Vault' }])
    expect(toNumenAddress(address)).toBe(address)
  })

  it('restores the same account from the phrase it was made with', () => {
    const mnemonic = newMnemonic()
    const address = importSuri('Vault', mnemonic, 'correct horse battery')
    removeKey(address)
    expect(hasKey(address)).toBe(false)

    expect(importSuri('Restored', mnemonic, 'another password')).toBe(address)
  })

  it('gives every key its own account', () => {
    expect(newKey('One', 'password one')).not.toBe(newKey('Two', 'password two'))
  })
})

describe('previewing a phrase', () => {
  it('shows the address the phrase will be stored under', () => {
    const mnemonic = newMnemonic()
    expect(addressOf(mnemonic)).toBe(importSuri('Vault', mnemonic, 'password'))
  })

  it('derives what polkadot-js derives, storing nothing', () => {
    expect(addressOf(`${DEV_PHRASE}//Alice`)).toBe(ALICE_NUMEN)
    expect(listKeys()).toEqual([])
  })
})

describe('importing a phrase', () => {
  it('derives what polkadot-js derives', () => {
    const address = importSuri('Alice', `${DEV_PHRASE}//Alice`, 'password')
    expect(address).toBe(ALICE_NUMEN)
    expect(toNumenAddress(ALICE_GENERIC)).toBe(address)
  })

  it('rejects a phrase whose checksum does not add up', () => {
    const typo = DEV_PHRASE.replace('bottom', 'bottle')
    expect(() => importSuri('Typo', typo, 'password')).toThrow(VaultError)
  })

  it('rejects an empty phrase rather than inventing a key', () => {
    expect(() => importSuri('Nothing', '   ', 'password')).toThrow(VaultError)
  })

  it('refuses the same key twice', () => {
    importSuri('Alice', `${DEV_PHRASE}//Alice`, 'password')
    expect(() => importSuri('Alice again', `${DEV_PHRASE}//Alice`, 'other')).toThrow(VaultError)
  })

  it('refuses to store under an empty password', () => {
    expect(() => importSuri('Vault', newMnemonic(), '')).toThrow(VaultError)
    expect(listKeys()).toEqual([])
  })
})

describe('unlocking', () => {
  it('binds the signer to the account it belongs to', () => {
    const address = newKey()
    const account = unlockKey(address, 'correct horse battery')

    expect(account.address).toBe(address)
    expect(account.signer.publicKey).toEqual(decodeAddress(address))
  })

  it('signs with the key behind the address', async () => {
    const address = newKey()
    const account = unlockKey(address, 'correct horse battery')

    const message = stringToU8a('numen')
    const signature = await account.signer.signBytes(message)
    // The signer may wrap a payload before signing it, either form has to
    // verify against this account's public key and nobody else's
    const wrapped = u8aConcat(stringToU8a('<Bytes>'), message, stringToU8a('</Bytes>'))
    const key = decodeAddress(address)

    expect(
      sr25519Verify(message, signature, key) || sr25519Verify(wrapped, signature, key),
    ).toBe(true)

    const other = newKey('Other', 'password')
    expect(sr25519Verify(wrapped, signature, decodeAddress(other))).toBe(false)
  })

  it('refuses the wrong password', () => {
    const address = newKey()
    expect(() => unlockKey(address, 'wrong')).toThrow(VaultError)
  })

  it('refuses an address it never stored', () => {
    expect(() => unlockKey(ALICE_NUMEN, 'password')).toThrow(VaultError)
  })
})

describe('deriving a key', () => {
  it('is a key of its own, under its own password', () => {
    const parent = newKey()
    const child = deriveKey(parent, 'correct horse battery', '//0', 'Child', 'own password')

    expect(child).not.toBe(parent)
    expect(listKeys().map((key) => key.name)).toEqual(['Vault', 'Child'])
    expect(unlockKey(child, 'own password').address).toBe(child)
    expect(() => unlockKey(child, 'correct horse battery')).toThrow(VaultError)
  })

  it('lands where the same path lands in polkadot-js', () => {
    const parent = importSuri('Parent', DEV_PHRASE, 'password')
    expect(deriveKey(parent, 'password', '//Alice', 'Alice', 'other')).toBe(ALICE_NUMEN)
  })

  it('refuses a path that is not one', () => {
    const parent = newKey()
    expect(() => deriveKey(parent, 'correct horse battery', 'nonsense', 'Child', 'p')).toThrow(
      /derivation path/,
    )
  })

  it('refuses without the parent password', () => {
    const parent = newKey()
    expect(() => deriveKey(parent, 'wrong', '//0', 'Child', 'p')).toThrow(VaultError)
    expect(listKeys()).toHaveLength(1)
  })

  it('refuses an empty password for the child', () => {
    const parent = newKey()
    expect(() => deriveKey(parent, 'correct horse battery', '//0', 'Child', '')).toThrow(VaultError)
    expect(listKeys()).toHaveLength(1)
  })
})

describe('changing a password', () => {
  it('leaves the account alone, only the password that opens it', () => {
    const address = newKey()
    changePassword(address, 'correct horse battery', 'a longer one')

    expect(listKeys()).toEqual([{ address, name: 'Vault' }])
    expect(unlockKey(address, 'a longer one').address).toBe(address)
    expect(() => unlockKey(address, 'correct horse battery')).toThrow(VaultError)
  })

  it('refuses without the current password, changing nothing', () => {
    const address = newKey()
    expect(() => changePassword(address, 'wrong', 'a longer one')).toThrow(VaultError)
    expect(unlockKey(address, 'correct horse battery').address).toBe(address)
  })

  it('refuses an empty password, changing nothing', () => {
    const address = newKey()
    expect(() => changePassword(address, 'correct horse battery', '')).toThrow(VaultError)
    expect(unlockKey(address, 'correct horse battery').address).toBe(address)
  })

  it('refuses an address it never stored', () => {
    expect(() => changePassword(ALICE_NUMEN, 'password', 'other')).toThrow(VaultError)
  })
})

describe('keystore files', () => {
  it('hands the file over only to the password that opens it', () => {
    const address = newKey()
    expect(() => exportKey(address, 'wrong')).toThrow(VaultError)
    expect(() => verifyPassword(address, 'wrong')).toThrow(VaultError)
    expect(exportKey(address, 'correct horse battery').address).toBeTruthy()
  })

  it('survives an export and a re-import', () => {
    const address = newKey()
    const file = exportKey(address, 'correct horse battery')
    removeKey(address)

    expect(importJson(file, 'correct horse battery')).toBe(address)
    expect(unlockKey(address, 'correct horse battery').address).toBe(address)
  })

  it('re-encrypts an imported file under the current scheme', () => {
    const address = newKey()
    const file = exportKey(address, 'correct horse battery')
    removeKey(address)

    importJson(file, 'correct horse battery')
    const stored = exportKey(address, 'correct horse battery')

    expect(stored.encoded).not.toBe(file.encoded)
    expect(stored.encoding.type).toEqual(['scrypt', 'xsalsa20-poly1305'])
    expect(unlockKey(address, 'correct horse battery').address).toBe(address)
  })

  it('keeps the name a file carries', () => {
    const address = newKey('Original')
    const file = exportKey(address, 'correct horse battery')
    removeKey(address)

    importJson(file, 'correct horse battery')
    expect(listKeys()).toEqual([{ address, name: 'Original' }])
  })

  it('rejects a file whose address is not the key inside', () => {
    const address = newKey()
    const other = newKey('Other', 'other password')
    const file = { ...exportKey(address, 'correct horse battery'), address: other }
    removeKey(address)

    expect(() => importJson(file, 'correct horse battery')).toThrow(/does not match/)
    expect(hasKey(address)).toBe(false)
  })

  it('exports the standard polkadot-js format', () => {
    const address = newKey()
    const file = exportKey(address, 'correct horse battery')

    expect(file.encoding.content).toContain('pkcs8')
    expect(file.encoding.content).toContain('sr25519')
    expect(file.encoding.type).toContain('xsalsa20-poly1305')
  })

  it('will not store a file it cannot open', () => {
    const address = newKey()
    const file = exportKey(address, 'correct horse battery')
    removeKey(address)

    expect(() => importJson(file, 'wrong')).toThrow(VaultError)
    expect(listKeys()).toEqual([])
  })

  it('rejects something that is not a keystore', () => {
    expect(() => importJson({ hello: 'world' }, 'password')).toThrow(VaultError)
  })

  it('names the problem when handed a whole keyring backup', () => {
    expect(() => importJson({ accounts: [], encoded: 'x', encoding: {} }, 'password')).toThrow(
      /backs up a whole keyring/,
    )
  })

  it('refuses a file whose address names nothing on this chain', () => {
    const address = newKey()
    const file = { ...exportKey(address, 'correct horse battery'), address: '0x1234567890abcdef1234567890abcdef12345678' }
    removeKey(address)

    expect(() => importJson(file, 'correct horse battery')).toThrow(/cannot use/)
    expect(listKeys()).toEqual([])
  })
})

describe('deleting a key', () => {
  it('leaves the others alone', () => {
    const first = newKey('One', 'password one')
    const second = newKey('Two', 'password two')

    removeKey(first)
    expect(listKeys().map((k) => k.address)).toEqual([second])
  })
})
