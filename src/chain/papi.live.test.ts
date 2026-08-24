// @vitest-environment node
/**
 * Runs against a node rather than the mock, which is the only way to know that a
 * call encodes the way the runtime decodes it. Start one and run `pnpm test:live`.
 *
 *   numen --dev --tmp --miner <ss58> --node-miner 1
 *
 * A dev chain has no registrar until prime adds one, and no account clears the
 * identity standard until a registrar has judged it. On --dev prime is Alice,
 * who signs everything here anyway, so the suite sets that up for itself.
 *
 * The dev preset seeds several GRANDPA authorities and one node holds one key,
 * so nothing ever finalizes. Submit resolves at finality, which leaves a watch
 * open behind every call, and enough open watches pin more blocks than the node
 * keeps. Start a node that has not been running long, and give a stretch of the
 * suite its own client rather than adding calls to one that has done many.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { Keyring } from '@polkadot/keyring'
import { hexToU8a, u8aToHex as toHex } from '@polkadot/util'
import { blake2AsHex, cryptoWaitReady, encodeMultiAddress } from '@polkadot/util-crypto'
import { Binary, createClient, Enum } from 'polkadot-api'
import { getPolkadotSigner } from 'polkadot-api/signer'
import { getWsProvider } from 'polkadot-api/ws'
import { toNumenAddress } from '@/lib/address'
import type { WalletAccount } from '@/signing/types'
import { NETWORKS, SS58_PREFIX, UNIT } from './config'
import { depositFor, EMPTY_IDENTITY, IDENTITY_FIELDS, isQualified, labelOf } from './identity'
import { createPapiRepository } from './papi'
import { transferableOf, type AccountBalance, type Operation } from './types'
import { scheduleOver } from './vesting'

/** pallet_identity's Data, the way papi.ts writes one, so the two agree. */
const toData = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length === 0) return Enum('None')
  if (bytes.length === 1) return Enum('Raw1', bytes[0]!)
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return Enum(`Raw${bytes.length}`, `0x${hex}`)
}

/** Only what this suite reaches for, since the wallet's own calls go through the repository. */
interface PrimeTx {
  getEncodedData(): Promise<Uint8Array>
  signSubmitAndWatch(signer: WalletAccount['signer']): {
    subscribe(observer: {
      next: (event: { type: string; found?: boolean }) => void
      error: (problem: unknown) => void
    }): { unsubscribe(): void }
  }
}

interface UnsafeApi {
  query: {
    Balances: {
      TotalIssuance: { getValue(at: { at: string }): Promise<bigint> }
      Locks: {
        getValue(address: string): Promise<{ amount: bigint }[]>
      }
    }
  }
  tx: {
    System: { set_code(args: { code: unknown }): PrimeTx }
    Balances: { force_transfer(args: { source: unknown; dest: unknown; value: bigint }): PrimeTx }
    Identity: {
      add_registrar(args: { account: unknown }): PrimeTx
      set_identity(args: { info: Record<string, unknown> }): PrimeTx
      provide_judgement(args: {
        reg_index: number
        target: unknown
        judgement: unknown
        identity: string
      }): PrimeTx
    }
  }
}

/**
 * A dev node never finalizes, so PAPI pins every block on the unfinalized fork
 * and one left running long enough stops answering. Point this at a fresh one
 * rather than restarting whatever is on the default port.
 */
const RPC = process.env.NUMEN_RPC ?? NETWORKS.local.rpc

const repository = createPapiRepository({ ...NETWORKS.local, rpc: RPC })
const raw = createClient(getWsProvider(RPC))
let alice: WalletAccount

/** The raw client, for the two calls the wallet itself never makes. */
const api = raw.getUnsafeApi() as unknown as UnsafeApi

// One field a single byte, since PAPI's codec takes Raw1 as a bare number and
// a hex string there is refused
const info = {
  ...EMPTY_IDENTITY,
  display: 'Alice',
  email: 'alice@numen-network.org',
  github: 'a',
  x: '@alice',
  telegram: '@alice_numen',
}

/**
 * Resolves once the call is in a best block, since one dev node cannot finalize.
 * A call the chain refuses has to come back as what it said rather than as a
 * timeout, or every failure reads the same.
 */
const send = (operation: Operation) =>
  new Promise<void>((resolve, reject) => {
    repository.submit(alice, operation, (progress) => {
      if (progress.stage === 'inBlock') resolve()
    }).catch(reject)
    setTimeout(() => reject(new Error(`${operation.kind} never made it into a block`)), 90_000)
  })

/** Calls the wallet has no business making, which prime makes here instead. */
const asPrime = (tx: PrimeTx) =>
  new Promise<void>((resolve, reject) => {
    const sub = tx.signSubmitAndWatch(alice.signer).subscribe({
      next(event) {
        if (event.type === 'txBestBlocksState' && event.found) {
          sub.unsubscribe()
          resolve()
        }
      },
      error: reject,
    })
  })

beforeAll(async () => {
  await cryptoWaitReady()
  const pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice')
  alice = {
    // The chain hands every address back in Numen's prefix, so the wallet holds
    // it that way and comparisons are against the same string
    address: toNumenAddress(pair.address),
    label: 'Alice',
    source: 'keystore',
    signer: getPolkadotSigner(pair.publicKey, 'Sr25519', (input) => pair.sign(input)),
  }

  if ((await repository.registrars()).length === 0) {
    await asPrime(api.tx.Identity.add_registrar({ account: Enum('Id', alice.address) }))
  }
}, 200_000)

describe('identity', () => {
  it('writes one the chain reads back whole', { timeout: 200_000 }, async () => {
    await send({ kind: 'registerIdentity', info, registrar: null })

    const registration = (await repository.standingOf(alice.address)).own
    const { identityBasicDeposit, identityByteDeposit } = await repository.facts()
    expect(registration?.info).toEqual(info)
    expect(registration?.deposit).toBe(depositFor(info, identityBasicDeposit, identityByteDeposit))
  })

  // Two calls in one signature, so nobody pays a deposit for an identity that no
  // registrar was ever asked about
  it('registers and asks in one go', { timeout: 200_000 }, async () => {
    const [registrar] = await repository.registrars()
    expect(registrar).toBeDefined()

    await send({
      kind: 'registerIdentity',
      info,
      registrar: { index: registrar!.index, maxFee: UNIT },
    })

    expect((await repository.standingOf(alice.address)).own?.judgements).toEqual([
      { registrar: 0, judgement: 'FeePaid' },
    ])
    await send({ kind: 'cancelJudgement', registrar: 0 })
  })

  it('charges less for the pair than for the two apart', async () => {
    const both = await repository.estimateFee(alice.address, {
      kind: 'registerIdentity',
      info,
      registrar: { index: 0, maxFee: UNIT },
    })
    const apart =
      (await repository.estimateFee(alice.address, {
        kind: 'registerIdentity',
        info,
        registrar: null,
      })) +
      (await repository.estimateFee(alice.address, {
        kind: 'requestJudgement',
        registrar: 0,
        maxFee: UNIT,
      }))

    expect(both).toBeLessThan(apart)
  })

  it('asks a registrar and reads the request back', { timeout: 200_000 }, async () => {
    const registrars = await repository.registrars()
    expect(registrars[0]?.index).toBe(0)

    await send({ kind: 'requestJudgement', registrar: 0, maxFee: UNIT })
    expect((await repository.standingOf(alice.address)).own?.judgements).toEqual([
      { registrar: 0, judgement: 'FeePaid' },
    ])

    await send({ kind: 'cancelJudgement', registrar: 0 })
    expect((await repository.standingOf(alice.address)).own?.judgements).toEqual([])
  })

  // What the two lines under the registrar box in the dialog are built on
  it('keeps a paid request across an edit', { timeout: 300_000 }, async () => {
    await send({
      kind: 'registerIdentity',
      info,
      registrar: { index: 0, maxFee: UNIT },
    })
    expect((await repository.standingOf(alice.address)).own?.judgements).toEqual([
      { registrar: 0, judgement: 'FeePaid' },
    ])

    // Nobody asked again, and the request is still there
    await send({
      kind: 'registerIdentity',
      info: { ...info, display: 'Alicia' },
      registrar: null,
    })
    const after = (await repository.standingOf(alice.address)).own
    expect(after?.info.display).toBe('Alicia')
    expect(after?.judgements).toEqual([{ registrar: 0, judgement: 'FeePaid' }])

    await send({ kind: 'cancelJudgement', registrar: 0 })
  })

  /**
   * The registrar's own call. The chain hashes the identity the verdict names
   * and turns the call down if what it holds hashes to anything else, so this
   * proves the wallet hashes the same bytes the runtime does.
   */
  it('records a verdict against the identity it was given for', { timeout: 200_000 }, async () => {
    await send({ kind: 'registerIdentity', info, registrar: null })
    await send({
      kind: 'provideJudgement',
      registrar: 0,
      target: alice.address,
      judgement: 'KnownGood',
      info,
    })

    const after = (await repository.standingOf(alice.address)).own
    expect(after?.judgements).toEqual([{ registrar: 0, judgement: 'KnownGood' }])

    // A verdict on anything but what the chain holds is the case that matters
    await expect(
      send({
        kind: 'provideJudgement',
        registrar: 0,
        target: alice.address,
        judgement: 'Reasonable',
        info: { ...info, display: 'Somebody else' },
      }),
    ).rejects.toThrow('Identity: JudgementForDifferentIdentity')

    await send({ kind: 'clearIdentity' })
  })

  it('prices every identity call through the runtime', async () => {
    const calls: Operation[] = [
      { kind: 'registerIdentity', info, registrar: null },
      { kind: 'clearIdentity' },
      { kind: 'requestJudgement', registrar: 0, maxFee: UNIT },
      { kind: 'cancelJudgement', registrar: 0 },
    ]

    for (const call of calls) {
      expect(await repository.estimateFee(alice.address, call)).toBeGreaterThan(0n)
    }
  })
})

describe('vesting', () => {
  it('grants a schedule the chain reads back whole', { timeout: 200_000 }, async () => {
    const bob = toNumenAddress(new Keyring({ type: 'sr25519' }).addFromUri('//Bob').address)
    // Whatever an earlier run left, since a grant only ever adds to the list
    const held = await repository.vesting(bob)
    const { blockSeconds } = await repository.facts()
    const schedule = scheduleOver(100n * UNIT, 30, 1_000, blockSeconds)

    await send({ kind: 'vestedTransfer', to: bob, schedule })

    expect(await repository.vesting(bob)).toEqual([...held, schedule])
  })

  it('prices the release call, which the granter never signs', async () => {
    expect(await repository.estimateFee(alice.address, { kind: 'vest' })).toBeGreaterThan(0n)
  })

  /**
   * A refused call is the one place the wallet reads something back out of the
   * runtime rather than writing into it, and a pallet name on its own says
   * which one turned it down without saying what for.
   */
  it('says which pallet refused a call and what it refused it for', { timeout: 200_000 }, async () => {
    // Alice grants rather than receives, so she has nothing to release
    await expect(send({ kind: 'vest' })).rejects.toThrow('Vesting: NotVesting')
  })
})

describe('balances', () => {
  it('reads the lock list rather than working a figure out of frozen', async () => {
    let stop: (() => void) | undefined
    const held = await new Promise<AccountBalance>((resolve) => {
      stop = repository.subscribeBalance(alice.address, resolve)
    })
    stop?.()

    // Alice authors every block, so her free balance moves between one read and
    // the next. Only the lock list is worth reading twice
    const locks = await api.query.Balances.Locks.getValue(alice.address)
    const biggest = locks.reduce((most, lock) => (lock.amount > most ? lock.amount : most), 0n)

    // The governance suite leaves a conviction lock behind, so there is one here
    expect(held.locked).toBe(biggest)
    const { existentialDeposit } = await repository.facts()
    expect(held.transferable).toBe(
      transferableOf(held.free, held.reserved, held.frozen, existentialDeposit),
    )
  })
})

describe('governance', () => {
  it('reads the track table the runtime carries', async () => {
    const tracks = await repository.tracks()
    const { spenders } = await repository.facts()

    // Two independent chain reads of the same table have to name the same tracks
    expect(tracks.map((track) => track.id)).toEqual(spenders.map((spender) => spender.track))
    for (const track of tracks) {
      // A name that decodes wrong keeps its NUL padding or comes back empty
      expect(track.name).toMatch(/^[ -~]+$/)
      expect(track.decisionDeposit > 0n).toBe(true)
      expect(['linear', 'reciprocal']).toContain(track.approvalCurve.kind)
      expect(['linear', 'reciprocal']).toContain(track.supportCurve.kind)
    }
  })

  it('carries the evm facts the metamask flow builds on', async () => {
    const { symbol, evmChainId, balancesErc20 } = await repository.facts()

    expect(symbol).toMatch(/\S/)
    expect(evmChainId).toBeGreaterThan(0)
    expect(balancesErc20).toMatch(/^0x[0-9a-f]{40}$/)
  })

  it('measures support against issuance that leaves the treasury out', async () => {
    const active = await repository.activeIssuance()
    const total = await api.query.Balances.TotalIssuance.getValue({ at: 'best' })

    expect(active).toBeGreaterThan(0n)
    expect(active).toBeLessThan(total)
  })

  /**
   * Every one of these is a shape written by hand against the pallet source,
   * and an entry that does not exist or a key of the wrong arity throws rather
   * than coming back empty. A chain with none of them still proves that much.
   */
  it('reads every map the wallet asks for', async () => {
    expect(await repository.spends()).toEqual([])
    expect(await repository.settled()).toEqual([])
    expect(await repository.bounties()).toEqual([])
    expect(await repository.childBounties()).toEqual([])
    expect(await repository.pending([alice.address])).toEqual([])
    expect(await repository.vesting(alice.address)).toEqual([])
    expect(await repository.subsOf(alice.address)).toEqual({ deposit: 0n, list: [] })
  })

  it('opens a referendum, votes on it, and takes the vote back', { timeout: 400_000 }, async () => {
    // Only a checked identity may open one, and only prime may check it
    await send({ kind: 'registerIdentity', info, registrar: null })
    // The judgement names the identity by the hash of what was registered, so
    // this has to encode the same info rather than a copy of it that can drift
    const encoded = await api.tx.Identity.set_identity({
      info: Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, toData(info[field])])),
    }).getEncodedData()

    await send({ kind: 'requestJudgement', registrar: 0, maxFee: UNIT })
    await asPrime(
      api.tx.Identity.provide_judgement({
        reg_index: 0,
        target: Enum('Id', alice.address),
        judgement: Enum('Reasonable'),
        identity: blake2AsHex(encoded.slice(2), 256),
      }),
    )
    expect(isQualified(await repository.standingOf(alice.address))).toBe(true)

    const before = await repository.referenda()
    // The metadata goes up as a preimage keyed by its own hash, so a suite that
    // proposed the same words twice would be turned down with AlreadyNoted
    const words = `The suite needs one and the chain keeps it beside the title. ${Date.now()}`
    await send({
      kind: 'propose',
      track: 0,
      amount: 1_000n * UNIT,
      beneficiary: alice.address,
      title: 'Pay Alice a thousand',
      description: words,
    })

    const opened = (await repository.referenda()).filter(
      (referendum) => !before.some((old) => old.index === referendum.index),
    )
    const referendum = opened[0]
    expect(referendum).toBeDefined()
    expect(referendum?.track).toBe(0)
    expect(referendum?.state).toBe('preparing')
    // Noted as a preimage, named by set_metadata, and read back through both
    expect(referendum?.title).toBe('Pay Alice a thousand')
    expect(referendum?.description).toBe(words)
    // The proposal is inline, so the runtime's own metadata reads it back
    expect(referendum?.proposal).toEqual({
      kind: 'spend',
      amount: 1_000n * UNIT,
      beneficiary: alice.address,
    })

    // The title went up as a preimage the proposer is paying for
    const noted = await repository.preimages([alice.address])
    expect(noted.length).toBeGreaterThan(0)
    expect(noted[0]?.who).toBe(alice.address)
    expect(noted[0]?.amount).toBeGreaterThan(0n)

    const index = referendum!.index
    await send({ kind: 'decisionDeposit', poll: index })
    expect((await repository.referenda()).find((entry) => entry.index === index)?.decisionDeposit).toBe(
      100n * UNIT,
    )

    await send({
      kind: 'vote',
      poll: index,
      ballot: { kind: 'aye', conviction: 'Locked2x', amount: 5_000n * UNIT },
    })

    const voted = (await repository.referenda()).find((entry) => entry.index === index)
    // Two convictions on five thousand, counted once for support
    expect(voted?.tally?.ayes).toBe(10_000n * UNIT)
    expect(voted?.tally?.support).toBe(5_000n * UNIT)

    const locks = await repository.locks(alice.address)
    // The poll it is holding, which is what the release dialog takes back
    expect(locks.find((lock) => lock.track === 0)).toMatchObject({
      amount: 5_000n * UNIT,
      polls: [index],
    })

    await send({ kind: 'removeVote', track: 0, poll: index })
    expect(
      (await repository.locks(alice.address)).find((lock) => lock.track === 0)?.polls,
    ).toEqual([])
  })

  it('prices every governance call through the runtime', async () => {
    const calls: Operation[] = [
      {
        kind: 'propose',
        track: 1,
        amount: UNIT,
        beneficiary: alice.address,
        title: 'A title',
        description: 'A description',
      },
      { kind: 'decisionDeposit', poll: 0 },
      { kind: 'vote', poll: 0, ballot: { kind: 'nay', conviction: 'None', amount: UNIT } },
      { kind: 'vote', poll: 0, ballot: { kind: 'abstain', amount: UNIT } },
      { kind: 'removeVote', track: 0, poll: 0 },
      { kind: 'unlock', track: 0, target: alice.address },
    ]

    for (const call of calls) {
      expect(await repository.estimateFee(alice.address, call)).toBeGreaterThan(0n)
    }
  })

  /**
   * Utility takes a decoded call, not an encoded one, so a batch only prices at
   * all if every call in it was built the way the runtime expects.
   */
  it('prices a batch, and asks more for it than for the calls apart', async () => {
    const transfer: Operation = { kind: 'transfer', to: alice.address, amount: UNIT }
    const one = await repository.estimateFee(alice.address, transfer)
    const ten = await repository.estimateFee(alice.address, {
      kind: 'batch',
      calls: Array.from({ length: 10 }, () => transfer),
    })

    expect(ten).toBeGreaterThan(one)
    // And less than paying for ten of them, which is the whole point of it
    expect(ten).toBeLessThan(one * 10n)
  })

  /** Every kind the wallet batches, since each is built through the same path. */
  it('prices a batch of every kind the wallet builds one from', async () => {
    const mixed: Operation[] = [
      { kind: 'batch', calls: [{ kind: 'payout', spend: 0 }, { kind: 'payout', spend: 1 }] },
      {
        kind: 'batch',
        calls: [
          { kind: 'refundDecision', poll: 0 },
          { kind: 'refundSubmission', poll: 1 },
          { kind: 'unnotePreimage', hash: `0x${'11'.repeat(32)}` },
        ],
      },
      {
        kind: 'batch',
        calls: [
          { kind: 'removeVote', track: 0, poll: 0 },
          { kind: 'unlock', track: 0, target: alice.address },
        ],
      },
      {
        kind: 'batch',
        calls: [
          { kind: 'vote', poll: 0, ballot: { kind: 'aye', conviction: 'Locked1x', amount: UNIT } },
          { kind: 'vote', poll: 1, ballot: { kind: 'nay', conviction: 'None', amount: UNIT } },
        ],
      },
      {
        kind: 'batch',
        calls: [0, 1, 2].map((track) => ({
          kind: 'delegate',
          delegation: { track, to: alice.address, conviction: 'Locked1x', amount: UNIT },
        })),
      },
    ]

    for (const call of mixed) {
      expect(await repository.estimateFee(alice.address, call)).toBeGreaterThan(0n)
    }
  })
})

/**
 * An empty map proves the entry name and the shape of its key. What a value
 * decodes to needs one in it, so these put something there first.
 *
 * They run on a client of their own. A dev chain never finalizes, so the watch
 * behind every call the wallet submits stays open, and enough of them pin more
 * blocks than the node will hold. A fresh client starts that count again.
 */
describe('what the chain hands back once there is something to read', () => {
  const fresh = createPapiRepository({ ...NETWORKS.local, rpc: RPC })
  const put = (operation: Operation, who: WalletAccount = alice) =>
    new Promise<void>((resolve, reject) => {
      fresh
        .submit(who, operation, (progress) => {
          if (progress.stage === 'inBlock') resolve()
        })
        .catch(reject)
      const late = `${operation.kind} from ${who.label} never made it into a block`
      setTimeout(() => reject(new Error(late)), 90_000)
    })

  it('finds a multisig call it started', { timeout: 200_000 }, async () => {
    const bob = toNumenAddress(new Keyring({ type: 'sr25519' }).addFromUri('//Bob').address)
    const multisig = encodeMultiAddress([alice.address, bob], 2, SS58_PREFIX)

    await put({
      kind: 'multisigApprove',
      threshold: 2,
      others: [bob],
      multisig,
      call: { kind: 'transfer', to: bob, amount: UNIT },
    })

    const [waiting] = await fresh.pending([multisig])
    expect(waiting?.multisig).toBe(multisig)
    expect(waiting?.depositor).toBe(alice.address)
    expect(waiting?.approvals).toEqual([alice.address])
    expect(waiting?.deposit).toBeGreaterThan(0n)
    // The timepoint is what every later approval has to name
    expect(waiting?.when.height).toBeGreaterThan(0)

    await put({
      kind: 'multisigCancel',
      threshold: 2,
      others: [bob],
      multisig,
      callHash: waiting!.callHash,
    })
    expect(await fresh.pending([multisig])).toEqual([])
  })

  /**
   * A multisig signs whatever the bytes say, including calls no wallet builds,
   * and a signatory is owed a look at those before signing. The runtime has
   * already decoded them by the time they get here, so this only checks that
   * what it decoded is written down rather than dropped.
   */
  it('writes out a call it has no words of its own for', { timeout: 200_000 }, async () => {
    const code = `0x${'07'.repeat(90_000)}`
    const upgrade = api.tx.System.set_code({ code: Binary.fromHex(code) })
    const hex = toHex(await upgrade.getEncodedData())

    const read = await fresh.readCall(hex)

    expect(read.label).toBe('System.set_code')
    // Nothing the wallet knows how to make, so it says so rather than guessing
    expect(read.operation).toBeNull()
    expect(read.args).toHaveLength(1)
    expect(read.args[0]?.name).toBe('code')
    // The blob itself is no use to a reader, its size and hash are
    expect(read.args[0]?.value).toContain('90,000 bytes')
    expect(read.args[0]?.value).toContain(blake2AsHex(hexToU8a(code), 256))
  })

  it('writes out the arguments of a call it does know, address and all', async () => {
    const bob = toNumenAddress(new Keyring({ type: 'sr25519' }).addFromUri('//Bob').address)
    const forced = api.tx.Balances.force_transfer({
      source: Enum('Id', alice.address),
      dest: Enum('Id', bob),
      value: 5n * UNIT,
    })

    const read = await fresh.readCall(toHex(await forced.getEncodedData()))

    expect(read.label).toBe('Balances.force_transfer')
    expect(read.args.map((arg) => arg.name)).toEqual(['source', 'dest', 'value'])
    expect(read.args[1]?.value).toBe(`Id ${bob}`)
    expect(read.args[2]?.value).toBe((5n * UNIT).toString())
  })

  /** The same reading of a call the wallet built itself, which the log shows. */
  it('names a call it built and writes out what it carries', async () => {
    const bob = toNumenAddress(new Keyring({ type: 'sr25519' }).addFromUri('//Bob').address)

    const call = await fresh.callData({ kind: 'transfer', to: bob, amount: 5n * UNIT })

    expect(call.name).toBe('Balances.transfer_keep_alive')
    expect(call.args.map((arg) => arg.name)).toEqual(['dest', 'value'])
    expect(call.args[0]?.value).toBe(`Id ${bob}`)
    expect(call.args[1]?.value).toBe((5n * UNIT).toString())
  })

  /**
   * The second signature has to name the block the first one landed in. Getting
   * that wrong is not an error the chain reports, it quietly starts a second
   * call beside the first, and neither ever reaches the threshold.
   */
  it('joins a call already going rather than starting another', { timeout: 200_000 }, async () => {
    const pair = new Keyring({ type: 'sr25519' }).addFromUri('//Bob')
    const bobAccount: WalletAccount = {
      address: toNumenAddress(pair.address),
      label: 'Bob',
      source: 'keystore',
      signer: getPolkadotSigner(pair.publicKey, 'Sr25519', (input) => pair.sign(input)),
    }
    const multisig = encodeMultiAddress([alice.address, bobAccount.address], 2, SS58_PREFIX)
    // Something only this run asks for, so an earlier one leaves nothing behind
    const call: Operation = { kind: 'transfer', to: bobAccount.address, amount: BigInt(Date.now()) }

    // Whatever else this multisig already has waiting is none of this test's
    // business, so it works out which entry is the one it just made
    const before = new Set((await fresh.pending([multisig])).map((entry) => entry.callHash))
    await put({ kind: 'multisigApprove', threshold: 2, others: [bobAccount.address], multisig, call })
    const started = (await fresh.pending([multisig])).find((entry) => !before.has(entry.callHash))
    expect(started?.approvals).toEqual([alice.address])

    await put(
      { kind: 'multisigApprove', threshold: 2, others: [alice.address], multisig, call },
      bobAccount,
    )

    // Two of two, so it ran and the pallet cleared the entry rather than
    // leaving a second one waiting beside the first
    const after = await fresh.pending([multisig])
    expect(after.map((entry) => entry.callHash)).not.toContain(started!.callHash)
  })

  it('finds a bounty it proposed, description and all', { timeout: 200_000 }, async () => {
    await put({ kind: 'proposeBounty', value: 5_000n * UNIT, description: 'Port it to mobile' })

    const [bounty] = await fresh.bounties()
    expect(bounty?.description).toBe('Port it to mobile')
    expect(bounty?.proposer).toBe(alice.address)
    expect(bounty?.value).toBe(5_000n * UNIT)
    expect(bounty?.state).toBe('proposed')
    expect(bounty?.curator).toBeNull()
    expect(bounty?.bond).toBeGreaterThan(0n)
  })

  it('finds the subs it set, and names one after its parent', { timeout: 300_000 }, async () => {
    const charlie = toNumenAddress(
      new Keyring({ type: 'sr25519' }).addFromUri('//Charlie').address,
    )
    await put({ kind: 'registerIdentity', info, registrar: null })
    await put({ kind: 'setSubs', subs: [{ address: charlie, name: 'Payouts' }] })

    const subs = await fresh.subsOf(alice.address)
    expect(subs.list).toEqual([{ address: charlie, name: 'Payouts' }])
    expect(subs.deposit).toBe((await fresh.facts()).subAccountDeposit)

    // The other half of the link, which is what the referenda list reads
    const standing = await fresh.standingOf(charlie)
    expect(standing.own).toBeNull()
    expect(standing.sub?.parent).toBe(alice.address)
    expect(standing.sub?.name).toBe('Payouts')
    expect(labelOf(standing)).toBe('Alice/Payouts')

    await put({ kind: 'setSubs', subs: [] })
    expect((await fresh.subsOf(alice.address)).list).toEqual([])
  })

  it('lets a sub reject its parent on its own signature', { timeout: 300_000 }, async () => {
    const pair = new Keyring({ type: 'sr25519' }).addFromUri('//Dave')
    const dave: WalletAccount = {
      address: toNumenAddress(pair.address),
      label: 'Dave',
      source: 'keystore',
      signer: getPolkadotSigner(pair.publicKey, 'Sr25519', (input) => pair.sign(input)),
    }

    await put({ kind: 'registerIdentity', info, registrar: null })
    await put({ kind: 'setSubs', subs: [{ address: dave.address, name: 'Payouts' }] })
    expect((await fresh.standingOf(dave.address)).sub?.parent).toBe(alice.address)

    await put({ kind: 'quitSub' }, dave)

    // Nobody asked the parent, and the list it signed is one shorter for it
    expect((await fresh.standingOf(dave.address)).sub).toBeNull()
    expect((await fresh.subsOf(alice.address)).list).toEqual([])
  })
})
