import {
  getRandomChannelSigner,
  mkAddress,
  mkBytes32,
  mkPublicIdentifier,
  createTestLinkedTransferState,
} from "@connext/vector-utils";
import pino from "pino";
import { ChannelUpdateError, LinkedTransferResolverEncoding, LinkedTransferStateEncoding } from "@connext/vector-types";

import { Vector } from "../vector";

import { MemoryMessagingService } from "./services/messaging";
import { MemoryLockService } from "./services/lock";
import { MemoryStoreService } from "./services/store";
import { expect } from "./utils/assert";
import { config } from "./services/config";

describe("Vector.connect", () => {
  it("can be created", async () => {
    const signer = getRandomChannelSigner();
    const node = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      config.chainProviders,
      pino(),
    );
    expect(node).to.be.instanceOf(Vector);
    expect(node.publicIdentifier).to.be.eq(signer.publicIdentifier);
    expect(node.signerAddress).to.be.eq(signer.address);
  });
});

type ParamValidationTest = {
  name: string;
  params: any;
  error: string;
};

describe("Vector.setup", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();
    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      config.chainProviders,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const validParams = {
      counterpartyIdentifer: mkPublicIdentifier(),
      chainId: 2,
      timeout: "1000",
    };
    const tests: ParamValidationTest[] = [
      {
        name: "should fail if there is no counterparty",
        params: { ...validParams, counterpartyIdentifer: undefined },
        error: "should have required property 'counterpartyIdentifer'",
      },
      {
        name: "should fail if there is an invalid counterparty",
        params: { ...validParams, counterpartyIdentifer: "fail" },
        error: 'should match pattern "^indra([a-zA-Z0-9]{50})$"',
      },
      {
        name: "should fail if there is no chainId",
        params: { ...validParams, chainId: undefined },
        error: "should have required property 'chainId'",
      },
      {
        name: "should fail if there is an invalid chainId (is a string)",
        params: { ...validParams, chainId: "fail" },
        error: "should be number",
      },
      {
        name: "should fail if the chainId is below the minimum",
        params: { ...validParams, chainId: 0 },
        error: "should be >= 1",
      },
      {
        name: "should fail if there is no timeout",
        params: { ...validParams, timeout: undefined },
        error: "should have required property 'timeout'",
      },
      {
        name: "should fail if there is an invalid timeout",
        params: { ...validParams, timeout: "fail" },
        error: 'should match pattern "^([0-9])*$"',
      },
    ];
    for (const t of tests) {
      it(t.name, async () => {
        const ret = await vector.setup(t.params);
        expect(ret.isError).to.be.true;
        const error = ret.getError();
        expect(error?.message).to.be.eq(ChannelUpdateError.reasons.InvalidParams);
        expect(error?.context?.errors).to.include(t.error);
      });
    }
  });
});

describe("Vector.deposit", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();

    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      config.chainProviders,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const validParams = {
      channelAddress: mkAddress("0xccc"),
      amount: "12039",
      assetId: mkAddress("0xaaa"),
    };

    const tests: ParamValidationTest[] = [
      {
        name: "should fail if channelAddress is undefined",
        params: { ...validParams, channelAddress: undefined },
        error: "should have required property 'channelAddress'",
      },
      {
        name: "should fail if channelAddress is invalid",
        params: { ...validParams, channelAddress: "fail" },
        error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
      },
      {
        name: "should fail if amount is undefined",
        params: { ...validParams, amount: undefined },
        error: "should have required property 'amount'",
      },
      {
        name: "should fail if amount is invalid",
        params: { ...validParams, amount: "fail" },
        error: 'should match pattern "^([0-9])*$"',
      },
      {
        name: "should fail if assetId is undefined",
        params: { ...validParams, assetId: undefined },
        error: "should have required property 'assetId'",
      },
      {
        name: "should fail if assetId is invalid",
        params: { ...validParams, assetId: "fail" },
        error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
      },
    ];

    for (const { params, name, error } of tests) {
      it(name, async () => {
        const ret = await vector.deposit(params);
        expect(ret.isError).to.be.true;
        const err = ret.getError();
        expect(err?.message).to.be.eq(ChannelUpdateError.reasons.InvalidParams);
        expect(err?.context?.errors).to.include(error);
      });
    }
  });
});

describe("Vector.create", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();

    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      config.chainProviders,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const validParams = {
      channelAddress: mkAddress("0xccc"),
      amount: "123214",
      assetId: mkAddress("0xaaa"),
      transferDefinition: mkAddress("0xdef"),
      transferInitialState: createTestLinkedTransferState(),
      timeout: "133215",
      encodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
    };

    const tests: ParamValidationTest[] = [
      {
        name: "should fail if channelAddress is undefined",
        params: { ...validParams, channelAddress: undefined },
        error: "should have required property 'channelAddress'",
      },
      {
        name: "should fail if channelAddress is invalid",
        params: { ...validParams, channelAddress: "fail" },
        error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
      },
      {
        name: "should fail if amount is undefined",
        params: { ...validParams, amount: undefined },
        error: "should have required property 'amount'",
      },
      {
        name: "should fail if amount is invalid",
        params: { ...validParams, amount: "fail" },
        error: 'should match pattern "^([0-9])*$"',
      },
      {
        name: "should fail if assetId is undefined",
        params: { ...validParams, assetId: undefined },
        error: "should have required property 'assetId'",
      },
      {
        name: "should fail if assetId is invalid",
        params: { ...validParams, assetId: "fail" },
        error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
      },
      {
        name: "should fail if transferDefinition is undefined",
        params: { ...validParams, transferDefinition: undefined },
        error: "should have required property 'transferDefinition'",
      },
      {
        name: "should fail if transferDefinition is invalid",
        params: { ...validParams, transferDefinition: "fail" },
        error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
      },
      {
        name: "should fail if transferInitialState is undefined",
        params: { ...validParams, transferInitialState: undefined },
        error: "should have required property 'transferInitialState'",
      },
      {
        name: "should fail if transferInitialState is invalid",
        params: { ...validParams, transferInitialState: {} },
        error: "should have required property \'balance\',should have required property \'balance\',should match exactly one schema in oneOf",
      },
      {
        name: "should fail if timeout is undefined",
        params: { ...validParams, timeout: undefined },
        error: "should have required property 'timeout'",
      },
      {
        name: "should fail if timeout is invalid",
        params: { ...validParams, timeout: "fail" },
        error: 'should match pattern "^([0-9])*$"',
      },
      {
        name: "should fail if encodings is undefined",
        params: { ...validParams, encodings: undefined },
        error: "should have required property 'encodings'",
      },
      {
        name: "should fail if encodings is invalid",
        params: { ...validParams, encodings: [] },
        error: "should match exactly one schema in oneOf",
      },
    ];

    for (const { params, name, error } of tests) {
      it(name, async () => {
        const ret = await vector.create(params);
        expect(ret.isError).to.be.true;
        const err = ret.getError();
        expect(err?.message).to.be.eq(ChannelUpdateError.reasons.InvalidParams);
        expect(err?.context?.errors).to.include(error);
      });
    }
  });
});

describe("Vector.resolve", () => {
  let vector: Vector;

  beforeEach(async () => {
    const signer = getRandomChannelSigner();

    vector = await Vector.connect(
      new MemoryMessagingService(),
      new MemoryLockService(),
      new MemoryStoreService(),
      signer,
      config.chainProviders,
      pino(),
    );
  });

  describe("should validate parameters", () => {
    const validParams = {
      channelAddress: mkAddress("0xccc"),
      transferId: mkBytes32("0xaaabbb"),
      transferResolver: {
        preImage: mkBytes32("0xeeeeffff"),
      },
    };

    const tests: ParamValidationTest[] = [
      {
        name: "should fail if channelAddress is undefined",
        params: { ...validParams, channelAddress: undefined },
        error: "should have required property 'channelAddress'",
      },
      {
        name: "should fail if channelAddress is invalid",
        params: { ...validParams, channelAddress: "fail" },
        error: 'should match pattern "^0x[a-fA-F0-9]{40}$"',
      },
      {
        name: "should fail if transferId is undefined",
        params: { ...validParams, transferId: undefined },
        error: "should have required property 'transferId'",
      },
      {
        name: "should fail if transferId is invalid",
        params: { ...validParams, transferId: "fail" },
        error: 'should match pattern "^0x([a-fA-F0-9]{64})$"',
      },
      {
        name: "should fail if transferResolver is undefined",
        params: { ...validParams, transferResolver: undefined },
        error: "should have required property 'transferResolver'",
      },
      {
        name: "should fail if transferResolver is invalid",
        params: { ...validParams, transferResolver: { test: "fail" } },
        error:
          "should have required property 'preImage',should have required property 'responderSignature',should match exactly one schema in oneOf",
      },
    ];

    for (const { params, name, error } of tests) {
      it(name, async () => {
        const ret = await vector.resolve(params);
        expect(ret.isError).to.be.true;
        const err = ret.getError();
        expect(err?.message).to.be.eq(ChannelUpdateError.reasons.InvalidParams);
        expect(err?.context?.errors).to.include(error);
      });
    }
  });
});