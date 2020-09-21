import { LinkedTransfer, ChannelFactory } from "@connext/vector-contracts";
import {
  IVectorStore,
  JsonRpcProvider,
  UpdateType,
  LinkedTransferStateEncoding,
  LinkedTransferResolverEncoding,
  OutboundChannelUpdateError,
  InboundChannelUpdateError,
  FullChannelState,
  FullTransferState,
  Balance,
  TransferName,
  Values,
  DEFAULT_TRANSFER_TIMEOUT,
  NetworkContext,
} from "@connext/vector-types";
import {
  getRandomChannelSigner,
  createTestChannelState,
  createTestChannelUpdate,
  mkAddress,
  mkHash,
  createTestChannelStateWithSigners,
  createTestChannelUpdateWithSigners,
  createTestLinkedTransferState,
  createCoreTransferState,
  hashCoreTransferState,
  createLinkedHash,
  encodeLinkedTransferResolver,
  encodeLinkedTransferState,
  createTestUpdateParams,
  ChannelSigner,
  hashTransferState,
  stringify,
  PartialFullChannelState,
  PartialChannelUpdate,
} from "@connext/vector-utils";
import { expect } from "chai";
import { BigNumber, BigNumberish, constants, Contract, utils } from "ethers";
import { MerkleTree } from "merkletreejs";
import Sinon from "sinon";

import { applyUpdate, generateUpdate } from "../update";

import { MockOnchainService } from "./services/onchain";
import { MemoryStoreService } from "./services/store";
import { env } from "./utils";
import { createTestFullLinkedTransferState } from "./utils/channel";

const { hexlify, randomBytes } = utils;

type ApplyUpdateTestParams = {
  name: string;
  updateType: UpdateType;
  stateOverrides?: PartialFullChannelState<any>;
  updateOverrides?: PartialChannelUpdate<any>;
  // transferAmount?: BigNumberish;
  transferOverrides?: Partial<FullTransferState<typeof TransferName.LinkedTransfer>>;
  expected?: Partial<FullChannelState<any>>;
  error?: Values<typeof InboundChannelUpdateError.reasons>;
};

describe("applyUpdate", () => {
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const signers = Array(2)
    .fill(0)
    .map(() => getRandomChannelSigner(providerUrl));

  // Generate test constants
  const participants = signers.map((s) => s.address);
  const publicIdentifiers = signers.map((s) => s.publicIdentifier);
  const channelAddress = mkAddress("0xccc");
  const networkContext: NetworkContext = {
    chainId,
    providerUrl,
    adjudicatorAddress: mkAddress("0xaaabbbcccc"),
    channelFactoryAddress: mkAddress("0xddddeeeffff"),
    vectorChannelMastercopyAddress: mkAddress("0xbeef"),
  };
  const merkleProofData = [mkHash("0xproof")];
  const merkleRoot = mkHash("0xroot");

  afterEach(() => {
    Sinon.restore();
  });

  const tests: ApplyUpdateTestParams[] = [
    {
      name: "should work for setup",
      updateType: UpdateType.setup,
      stateOverrides: {
        nonce: 0,
      },
      updateOverrides: {
        details: { counterpartyIdentifier: publicIdentifiers[1], networkContext, timeout: "8267345" },
        nonce: 1,
      },
      expected: {
        timeout: "8267345",
        latestDepositNonce: 0,
        balances: [],
        lockedBalance: [],
        assetIds: [],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should work for deposit (adding new assetId)",
      updateType: UpdateType.deposit,
      stateOverrides: {
        nonce: 1,
        balances: [],
        assetIds: [],
        lockedBalance: [],
        latestDepositNonce: 0,
      },
      updateOverrides: {
        details: { latestDepositNonce: 0 },
        nonce: 2,
        balance: { to: participants, amount: ["0", "17"] },
        assetId: mkAddress("0xaddee"),
      },
      expected: {
        latestDepositNonce: 0,
        balances: [{ to: participants, amount: ["0", "17"] }],
        lockedBalance: [],
        assetIds: [mkAddress("0xaddee")],
      },
    },
    {
      name: "should work for deposit (existing assetId)",
      updateType: UpdateType.deposit,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["0", "17"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        latestDepositNonce: 0,
      },
      updateOverrides: {
        details: { latestDepositNonce: 3 },
        nonce: 6,
        balance: { to: participants, amount: ["6", "17"] },
        assetId: mkAddress("0xaddee"),
      },
      expected: {
        latestDepositNonce: 3,
        balances: [
          { to: participants, amount: ["0", "17"] },
          { to: participants, amount: ["6", "17"] },
        ],
        lockedBalance: [],
        assetIds: [mkAddress(), mkAddress("0xaddee")],
      },
    },
    {
      name: "should work for create (bob creates)",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["43", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        merkleRoot: mkHash(),
      },
      updateOverrides: {
        balance: { to: participants, amount: ["43", "8"] },
        fromIdentifier: publicIdentifiers[1],
        toIdentifier: publicIdentifiers[0],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["0", "14"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["43", "8"] }],
        lockedBalance: ["14"],
        assetIds: [mkAddress()],
        merkleRoot,
      },
    },
    {
      name: "should work for create (alice creates)",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["43", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        merkleRoot: mkHash(),
      },
      updateOverrides: {
        balance: { to: participants, amount: ["29", "22"] },
        fromIdentifier: publicIdentifiers[0],
        toIdentifier: publicIdentifiers[1],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["14", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["29", "22"] }],
        lockedBalance: ["14"],
        assetIds: [mkAddress()],
        merkleRoot,
      },
    },
    {
      name: "should work for create when transfer does not include state participants",
      updateType: UpdateType.create,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["43", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: [],
        merkleRoot: mkHash(),
      },
      updateOverrides: {
        balance: { to: participants, amount: ["29", "22"] },
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: [mkAddress("0xffff"), participants[1]], amount: ["14", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["29", "22"] }],
        lockedBalance: ["14"],
        assetIds: [mkAddress()],
        merkleRoot,
      },
    },
    {
      name: "should work for resolve (bob resolves)",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["3", "4"] }],
        assetIds: [mkAddress()],
        lockedBalance: ["8"],
        merkleRoot,
      },
      updateOverrides: {
        balance: { to: participants, amount: ["3", "12"] },
        fromIdentifier: publicIdentifiers[1],
        toIdentifier: publicIdentifiers[0],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["0", "8"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["3", "12"] }],
        lockedBalance: [],
        assetIds: [mkAddress()],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should work for resolve (alice resolves)",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["13", "2"] }],
        assetIds: [mkAddress()],
        lockedBalance: ["9"],
        merkleRoot,
      },
      updateOverrides: {
        balance: { to: participants, amount: ["22", "2"] },
        fromIdentifier: publicIdentifiers[0],
        toIdentifier: publicIdentifiers[1],
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: participants, amount: ["9", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["22", "2"] }],
        lockedBalance: [],
        assetIds: [mkAddress()],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should work for resolve when transfer does not include state participants",
      updateType: UpdateType.resolve,
      stateOverrides: {
        nonce: 5,
        balances: [{ to: participants, amount: ["7", "22"] }],
        assetIds: [mkAddress()],
        lockedBalance: ["14"],
        merkleRoot,
      },
      updateOverrides: {
        balance: { to: participants, amount: ["7", "22"] },
        assetId: mkAddress(),
      },
      transferOverrides: {
        initialBalance: { to: [mkAddress("0xffff"), participants[1]], amount: ["14", "0"] },
        assetId: mkAddress(),
      },
      expected: {
        balances: [{ to: participants, amount: ["7", "22"] }],
        lockedBalance: [],
        assetIds: [mkAddress()],
        merkleRoot: mkHash(),
      },
    },
    {
      name: "should fail for an unrecognized update type",
      updateType: ("fail" as unknown) as UpdateType,
      error: InboundChannelUpdateError.reasons.BadUpdateType,
    },
  ];

  for (const test of tests) {
    const { name, updateType, stateOverrides, updateOverrides, transferOverrides, error, expected } = test;

    it(name, async () => {
      // Generate the previous state
      const previousState = createTestChannelStateWithSigners(
        signers,
        stateOverrides?.latestUpdate?.type ?? UpdateType.setup,
        { channelAddress, networkContext, ...stateOverrides },
      );

      // Generate the transfer (if needed)
      let transfer: FullTransferState | undefined = undefined;
      if (updateType === UpdateType.resolve || updateType === UpdateType.create) {
        // Create the full transfer state
        transfer = {
          ...createTestFullLinkedTransferState({
            balance: transferOverrides?.initialBalance,
            assetId: transferOverrides?.assetId ?? mkAddress(),
          }),
          ...transferOverrides,
        };
      }

      // Generate the update using sensible defaults from transfers
      const overrides: any = { channelAddress, nonce: previousState.nonce + 1 };
      if (updateType === UpdateType.create && transfer) {
        // mock out merkle tree
        Sinon.createStubInstance(MerkleTree, {
          getHexProof: merkleProofData,
          getHexRoot: merkleRoot,
        } as any);
        const { transferResolver, transferState, ...createDetails } = transfer;
        overrides.details = {
          ...createDetails,
          transferInitialState: transferState,
          merkleProofData,
          merkleRoot,
        };
      } else if (updateType === UpdateType.resolve && transfer) {
        Sinon.createStubInstance(MerkleTree, {
          getHexRoot: mkHash(),
        } as any);
        const { transferTimeout, transferState, ...resolveDetails } = transfer;
        overrides.details = {
          ...resolveDetails,
          merkleRoot: mkHash(),
        };
      }
      const update = createTestChannelUpdateWithSigners(signers, updateType, {
        ...overrides,
        ...updateOverrides,
      });

      // Call `applyUpdate`
      const result = await applyUpdate(update, previousState, transfer);

      // Verify result
      if (error) {
        expect(result.getError()?.message).to.be.eq(error);
      } else if (expected) {
        expect(result.getError()).to.be.undefined;
        expect(result.getValue()).to.containSubset({
          channelAddress,
          publicIdentifiers,
          participants,
          latestUpdate: update,
          nonce: previousState.nonce + 1,
          networkContext,
          ...expected,
        });
      } else {
        expect(false).to.be.eq("Neither error or expected result provided in test");
      }
    });
  }
});

// describe.skip("generateUpdate", () => {
//   const chainId = parseInt(Object.keys(env.chainProviders)[0]);
//   const providerUrl = env.chainProviders[chainId];
//   const provider = new JsonRpcProvider(providerUrl);
//   const wallet = env.sugarDaddy.connect(provider);
//   const chainService = new MockOnchainService();

//   let signers: ChannelSigner[];
//   let store: IVectorStore;
//   let linkedTransferDefinition: string;
//   let channelAddress: string;

//   beforeEach(async () => {
//     signers = Array(2)
//       .fill(0)
//       .map(() => getRandomChannelSigner(providerUrl));
//     store = new MemoryStoreService();
//     linkedTransferDefinition = env.chainAddresses[chainId].LinkedTransfer.address;

//     // Deploy multisig
//     // TODO: in channel deployment?
//     const factory = new Contract(env.chainAddresses[chainId].ChannelFactory.address, ChannelFactory.abi, wallet);
//     const created = new Promise((resolve) => {
//       factory.once(factory.filters.ChannelCreation(), (data) => {
//         resolve(data);
//       });
//     });
//     const tx = await factory.createChannel(signers[0].address, signers[1].address);
//     await tx.wait();
//     channelAddress = (await created) as string;
//   });

//   it("should work for setup", async () => {
//     const params = createTestUpdateParams(UpdateType.setup, {
//       details: {
//         counterpartyIdentifier: signers[1].publicIdentifier,
//         networkContext: {
//           channelFactoryAddress: env.chainAddresses[chainId].ChannelFactory.address,
//           vectorChannelMastercopyAddress: env.chainAddresses[chainId].VectorChannel.address,
//           adjudicatorAddress: env.chainAddresses[chainId].Adjudicator.address,
//           linkedTransferDefinition: env.chainAddresses[chainId].LinkedTransfer.address,
//           withdrawDefinition: env.chainAddresses[chainId].Withdraw.address,
//           chainId,
//           providerUrl,
//         },
//       },
//     });
//     const update = (await generateUpdate(params, undefined, store, chainService, signers[0])).getValue();
//     // eslint-disable-next-line @typescript-eslint/no-unused-vars
//     const { signatures, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.setup, {
//       balance: { to: signers.map((a) => a.address), amount: ["0", "0"] },
//       details: { networkContext: { ...params.details.networkContext }, timeout: params.details.timeout },
//     });
//     expect(update).to.containSubset(expected);
//     expect(update.signatures.filter((x) => !!x).length).to.be.eq(1);
//   });

//   // TODO it should first send an onchain tx -- otherwise this doesn't test anything
//   it.skip("should work for deposit", async () => {
//     // First, deploy a multisig
//     const state = createTestChannelStateWithSigners(signers, UpdateType.setup, {
//       nonce: 1,
//       balances: [],
//       assetIds: [],
//       latestDepositNonce: 0,
//       channelAddress,
//     });
//     const assetId = constants.AddressZero;
//     await store.saveChannelState(state, {} as any);
//     const params = createTestUpdateParams(UpdateType.deposit, {
//       channelAddress,
//       details: { channelAddress, assetId },
//     });
//     console.log(`params: ${stringify(params)}`);
//     const update = (await generateUpdate(params, state, store, chainService, signers[0])).getValue();
//     console.log(`update: ${stringify(update)}`);
//     const { signatures, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.deposit, {
//       channelAddress,
//       details: { latestDepositNonce: 0 },
//       nonce: state.nonce + 1,
//     });
//     console.log(`generatedUpdate: ${stringify(expected)}`);
//     expect(update).to.containSubset(expected);
//     expect(update.signatures.filter((x) => !!x).length).to.be.eq(1);
//   });

//   it("should work for create", async () => {
//     const transferInitialState = createTestLinkedTransferState({
//       balance: { to: signers.map((s) => s.address), amount: ["1", "0"] },
//     });
//     const assetId = constants.AddressZero;

//     // Create the channel state
//     const state = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
//       channelAddress,
//       nonce: 3,
//       lockedBalance: [],
//       balances: [transferInitialState.balance],
//       assetIds: [assetId],
//       latestDepositNonce: 1,
//     });
//     await store.saveChannelState(state, {} as any);

//     // Create the params
//     const params = createTestUpdateParams(UpdateType.create, {
//       channelAddress,
//       details: {
//         amount: "1",
//         transferDefinition: linkedTransferDefinition,
//         transferInitialState,
//         encodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
//       },
//     });

//     // Test update
//     const update = (await generateUpdate(params, state, store, chainService, signers[0])).getValue();

//     // Get expected value
//     const { signatures, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.create, {
//       channelAddress,
//       nonce: state.nonce + 1,
//       assetId,
//       balance: { to: signers.map((s) => s.address), amount: ["0", "0"] },
//       details: {
//         transferDefinition: linkedTransferDefinition,
//         transferEncodings: params.details.encodings,
//         transferInitialState,
//         transferTimeout: "1",
//       },
//     });
//     // DONT compare merkle values (don't know transfer id)
//     expect(update).to.containSubset({
//       ...expected,
//       details: {
//         ...expected.details,
//         transferId: (update.details as any).transferId,
//         merkleRoot: (update.details as any).merkleRoot,
//         merkleProofData: (update.details as any).merkleProofData,
//       },
//     });
//     expect(update.signatures.filter((x) => !!x).length).to.be.eq(1);
//   });

//   it("should work for resolve", async () => {
//     const preImage = hexlify(randomBytes(32));
//     const linkedHash = createLinkedHash(preImage);
//     const transferInitialState = createTestLinkedTransferState({
//       balance: { to: signers.map((s) => s.address), amount: ["1", "0"] },
//       linkedHash,
//     });
//     const assetId = constants.AddressZero;

//     const ret = await new Contract(linkedTransferDefinition, LinkedTransfer.abi, provider).resolve(
//       encodeLinkedTransferState(transferInitialState),
//       encodeLinkedTransferResolver({ preImage }),
//     );
//     const balance = {
//       to: ret.to,
//       amount: ret.amount.map((a) => a.toString()),
//     };

//     // Create the channel state
//     const state = createTestChannelStateWithSigners(signers, UpdateType.deposit, {
//       channelAddress,
//       nonce: 3,
//       lockedBalance: ["1"],
//       balances: [{ to: signers.map((s) => s.address), amount: ["0", "0"] }],
//       assetIds: [assetId],
//       latestDepositNonce: 1,
//     });

//     // Create the transfer core
//     const coreState = createCoreTransferState({
//       initialBalance: transferInitialState.balance,
//       initialStateHash: hashTransferState(transferInitialState, LinkedTransferStateEncoding),
//       channelAddress,
//       transferDefinition: linkedTransferDefinition,
//     });

//     // Create the resolve params
//     const params = createTestUpdateParams(UpdateType.resolve, {
//       channelAddress,
//       details: {
//         channelAddress,
//         transferId: coreState.transferId,
//         transferResolver: { preImage },
//       },
//     });

//     // Load the store
//     await store.saveChannelState(state, {} as any, {
//       ...coreState,
//       transferState: transferInitialState,
//       chainId: state.networkContext.chainId,
//       adjudicatorAddress: state.networkContext.adjudicatorAddress,
//       transferId: coreState.transferId,
//       transferEncodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
//     });

//     // Get expected values
//     const emptyTree = new MerkleTree([], hashCoreTransferState);
//     const { signatures: expectedSig, ...expected } = createTestChannelUpdateWithSigners(signers, UpdateType.resolve, {
//       channelAddress,
//       nonce: state.nonce + 1,
//       assetId,
//       balance,
//       details: {
//         transferId: coreState.transferId,
//         transferEncodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
//         transferDefinition: coreState.transferDefinition,
//         transferResolver: { preImage },
//         merkleRoot: constants.HashZero,
//       },
//     });

//     // Generate the update
//     const updateRet = await generateUpdate(params, state, store, chainService, signers[0]);
//     expect(updateRet.isError).to.be.false;
//     const { signatures: returnedSig, ...returnedUnsigned } = updateRet.getValue();

//     // TODO check signatures!!
//     expect(returnedUnsigned).to.containSubset(expected);
//   });
// });
