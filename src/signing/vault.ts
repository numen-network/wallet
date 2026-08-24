import { Keyring } from '@polkadot/keyring'
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types'
import {
  keyExtractPath,
  keyExtractSuri,
  mnemonicGenerate,
  mnemonicToMiniSecret,
  mnemonicValidate,
} from '@polkadot/util-crypto'
import { u8aToHex } from '@polkadot/util'
import { getPolkadotSigner } from 'polkadot-api/signer'
import { SS58_PREFIX } from '@/chain/config'
import { toNumenAddress } from '@/lib/address'
import type { WalletAccount } from './types'

/**
 * Keys the wallet holds itself, encrypted at rest in the standard polkadot-js
 * keystore format so an account can move between this wallet, polkadot-js apps
 * and the extension without being re-created.
 *
 * Nothing here caches a decrypted key. A pair exists only inside the call that
 * asked for it, which is why every signature costs a password and why no timer
 * has to remember to lock anything.
 */

const STORAGE_KEY = 'numen-wallet-keystore-v1'

export class VaultError extends Error {}

const keyring = new Keyring({ type: 'sr25519', ss58Format: SS58_PREFIX })

export interface VaultKey {
  address: string
  name: string
}

function read(): KeyringPair$Json[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as KeyringPair$Json[]).filter(isKeystore) : []
  } catch {
    return []
  }
}

function write(keys: KeyringPair$Json[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
}

function isKeystore(value: unknown): value is KeyringPair$Json {
  if (typeof value !== 'object' || value === null) return false
  const json = value as Partial<KeyringPair$Json>
  return typeof json.address === 'string' && typeof json.encoded === 'string' && Boolean(json.encoding)
}

/** What polkadot-js apps calls "backup all accounts", which this cannot open. */
function isBatchBackup(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Array.isArray((value as { accounts?: unknown }).accounts)
}

function nameOf(json: KeyringPair$Json): string {
  const name = json.meta?.['name']
  return typeof name === 'string' && name ? name : 'Local account'
}

export function listKeys(): VaultKey[] {
  return read().map((json) => ({ address: toNumenAddress(json.address), name: nameOf(json) }))
}

export function hasKey(address: string): boolean {
  return read().some((json) => toNumenAddress(json.address) === address)
}

function find(address: string): KeyringPair$Json {
  const json = read().find((entry) => toNumenAddress(entry.address) === address)
  if (!json) throw new VaultError('No such account')
  return json
}

/** The one place a key is decrypted. The pair is the caller's to lock. */
function open(json: KeyringPair$Json, password: string, wrong = 'Wrong password'): KeyringPair {
  try {
    const pair = keyring.createFromJson(json)
    pair.decodePkcs8(password)
    return pair
  } catch {
    throw new VaultError(wrong)
  }
}

function store(pair: KeyringPair, password: string): string {
  if (!password) throw new VaultError('A password is required')

  const json = pair.toJson(password)
  pair.lock()

  const address = toNumenAddress(json.address)
  if (hasKey(address)) throw new VaultError('That account is already in the wallet')

  write([...read(), json])
  return address
}

export function newMnemonic(): string {
  return mnemonicGenerate()
}

/**
 * The same account the phrase leads to, written as the seed importSuri takes.
 * Only a phrase in hand yields one. A stored key keeps the expanded secret and
 * nothing that made it, so this is answerable while an account is being made
 * and never afterwards.
 */
export function seedOf(mnemonic: string): string {
  return u8aToHex(mnemonicToMiniSecret(mnemonic))
}

/** The address a seed leads to, for showing one before anything is stored. */
export function addressOf(suri: string): string {
  const pair = keyring.createFromUri(suri, {}, 'sr25519')
  const address = toNumenAddress(pair.address)
  pair.lock()
  return address
}

/**
 * Twelve words or a raw seed, either one on its own or carrying a path. A
 * phrase whose checksum does not add up is a typo, and importing it silently
 * produces a different account than the one the user meant to restore.
 */
export function importSuri(name: string, suri: string, password: string): string {
  const trimmed = suri.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new VaultError('Enter a seed')

  const { phrase } = keyExtractSuri(trimmed)
  const isSeed = /^0x[0-9a-fA-F]{64}$/.test(phrase)
  if (!isSeed && !mnemonicValidate(phrase)) {
    throw new VaultError('That is not a valid seed')
  }

  try {
    return store(keyring.createFromUri(trimmed, { name }, 'sr25519'), password)
  } catch (error) {
    if (error instanceof VaultError) throw error
    throw new VaultError('That seed could not be read')
  }
}

/** How many junctions a path has, where anything unreadable has none. */
function junctions(suri: string): number {
  try {
    return keyExtractPath(suri).path.length
  } catch {
    return 0
  }
}

/**
 * A child account, derived from a key the wallet already holds. The parent has to
 * be open for it, and the child is its own key from then on, with its own password
 * and no way back to the parent.
 */
export function deriveKey(
  parent: string,
  parentPassword: string,
  path: string,
  name: string,
  password: string,
): string {
  const suri = path.trim()
  if (!junctions(suri)) {
    throw new VaultError('Enter a derivation path, such as //0 or //stash')
  }

  const pair = open(find(parent), parentPassword)
  const child = pair.derive(suri, { name })
  pair.lock()

  return store(child, password)
}

/**
 * Verified before it lands, so nobody stores a key they cannot open again.
 * Stored re-encoded under the current scheme, so a file made by an older
 * wallet does not keep its weaker encryption at rest.
 */
export function importJson(json: unknown, password: string): string {
  if (isBatchBackup(json)) {
    throw new VaultError('That file backs up a whole keyring. Export the one account and try again')
  }
  if (!isKeystore(json)) throw new VaultError('That file is not a keystore')

  const pair = open(json, password, 'Wrong password for this file')

  // A file is whatever someone hands over, and its address may name nothing
  let address: string
  try {
    address = toNumenAddress(json.address)
  } catch {
    pair.lock()
    throw new VaultError(`That file names an address this chain cannot use, ${json.address}`)
  }

  if (address !== pair.address) {
    pair.lock()
    throw new VaultError('That file has been altered. Its address does not match the key inside')
  }

  return store(pair, password)
}

/**
 * Everything that reaches a stored key goes through the password that opens it.
 * The file is encrypted either way, but handing it over is the user's decision to
 * make, not whoever is sitting at an unlocked browser.
 */
export function verifyPassword(address: string, password: string): void {
  open(find(address), password).lock()
}

export function exportKey(address: string, password: string): KeyringPair$Json {
  const json = find(address)
  open(json, password).lock()
  return json
}

/** Re-encrypts one key, so a password can change without the account changing. */
export function changePassword(address: string, from: string, to: string): void {
  if (!to) throw new VaultError('A password is required')

  const pair = open(find(address), from)
  const next = pair.toJson(to)
  pair.lock()
  write(read().map((entry) => (toNumenAddress(entry.address) === address ? next : entry)))
}

export function removeKey(address: string): void {
  write(read().filter((json) => toNumenAddress(json.address) !== address))
}

/** Decrypts for the length of one call. The caller holds the only reference. */
export function unlockKey(address: string, password: string): WalletAccount {
  const json = find(address)
  const pair = open(json, password)

  return {
    address,
    label: nameOf(json),
    source: 'keystore',
    signer: getPolkadotSigner(pair.publicKey, 'Sr25519', (input) => pair.sign(input)),
  }
}
