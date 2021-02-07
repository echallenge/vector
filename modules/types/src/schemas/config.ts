import { Static, Type } from "@sinclair/typebox";

import { AllowedSwapSchema, TAddress, TChainId, TContractAddresses, TIntegerString, TUrl } from "./basic";

export const VectorNodeConfigSchema = Type.Object({
  adminToken: Type.String(),
  authUrl: Type.Optional(Type.String({ format: "uri" })),
  chainAddresses: Type.Dict(TContractAddresses),
  chainProviders: Type.Dict(TUrl),
  dbUrl: Type.Optional(TUrl),
  logLevel: Type.Optional(
    Type.Union([
      Type.Literal("fatal"),
      Type.Literal("error"),
      Type.Literal("warn"),
      Type.Literal("info"),
      Type.Literal("debug"),
      Type.Literal("trace"),
      Type.Literal("silent"),
    ]),
  ),
  messagingUrl: Type.Optional(TUrl),
  mnemonic: Type.Optional(Type.String()),
  natsUrl: Type.Optional(TUrl),
  skipCheckIn: Type.Optional(Type.Boolean()),
});

export type VectorNodeConfig = Static<typeof VectorNodeConfigSchema>;

export const RebalanceProfileSchema = Type.Object({
  chainId: TChainId,
  assetId: TAddress,
  reclaimThreshold: TIntegerString,
  target: TIntegerString,
  collateralizeThreshold: TIntegerString,
});
export type RebalanceProfile = Static<typeof RebalanceProfileSchema>;

export const VectorRouterConfigSchema = Type.Object({
  adminToken: Type.String(),
  allowedSwaps: Type.Array(AllowedSwapSchema),
  chainProviders: Type.Dict(TUrl),
  dbUrl: Type.Optional(TUrl),
  nodeUrl: TUrl,
  logLevel: Type.Optional(
    Type.Union([
      Type.Literal("fatal"),
      Type.Literal("error"),
      Type.Literal("warn"),
      Type.Literal("info"),
      Type.Literal("debug"),
      Type.Literal("trace"),
      Type.Literal("silent"),
    ]),
  ),
  messagingUrl: Type.Optional(TUrl),
  rebalanceProfiles: Type.Array(RebalanceProfileSchema),
  mnemonic: Type.Optional(Type.String()),
});

export type VectorRouterConfig = Static<typeof VectorRouterConfigSchema>;
