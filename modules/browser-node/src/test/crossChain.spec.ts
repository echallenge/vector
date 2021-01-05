import { IChannelSigner } from "@connext/vector-types";
import {
  createTestChannelState,
  getRandomChannelSigner,
  getSignerAddressFromPublicIdentifier,
  getTestLoggers,
  MemoryMessagingService,
  MemoryStoreService,
} from "@connext/vector-utils";
import Sinon from "sinon";

import { BrowserNode } from "../";

import { env } from "./env";

describe("crossChainTransfer", () => {
  const testName = "checkIn";
  const { log } = getTestLoggers(testName, env.logLevel);

  let storeService: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let messagingService: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  let roger: IChannelSigner;

  beforeEach(() => {
    roger = getRandomChannelSigner();
    storeService = Sinon.createStubInstance(MemoryStoreService);
    messagingService = Sinon.createStubInstance(MemoryMessagingService);
    new BrowserNode({
      routerPublicIdentifier: roger.publicIdentifier,
    });
  });

  it("should send a cross chain transfer", async () => {
    const carol = getRandomChannelSigner();
    const dave = getRandomChannelSigner();
    const sender = createTestChannelState("create", {
      alice: getSignerAddressFromPublicIdentifier(roger.publicIdentifier),
      aliceIdentifier: roger.publicIdentifier,
      bob: getSignerAddressFromPublicIdentifier(carol.publicIdentifier),
      bobIdentifier: carol.publicIdentifier,
    });

    const receiver = createTestChannelState("create", {
      alice: getSignerAddressFromPublicIdentifier(roger.publicIdentifier),
      aliceIdentifier: roger.publicIdentifier,
      bob: getSignerAddressFromPublicIdentifier(dave.publicIdentifier),
      bobIdentifier: dave.publicIdentifier,
    });
  });
});
