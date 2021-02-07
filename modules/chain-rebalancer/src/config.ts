import { VectorRouterConfig, VectorRouterConfigSchema } from "@connext/vector-types";
import Ajv from "ajv";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";
import { Wallet } from "@ethersproject/wallet";
import { ChannelSigner } from "@connext/vector-utils";

const ajv = new Ajv();

const dbUrl = process.env.VECTOR_DATABASE_URL;
let vectorConfig: VectorRouterConfig;

const mnemonicEnv = process.env.VECTOR_MNEMONIC;
try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}
const mnemonic = mnemonicEnv || vectorConfig.mnemonic;

// Set defaults
vectorConfig.nodeUrl = vectorConfig.nodeUrl || "http://node:8000";
vectorConfig.messagingUrl = vectorConfig.messagingUrl || "http://messaging";

const validate = ajv.compile(VectorRouterConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  console.error(`Invalid config: ${JSON.stringify(vectorConfig, null, 2)}`);
  throw new Error(validate.errors?.map((err) => err.message).join(","));
}

// checksum allowed swaps + rebalance profiles
vectorConfig.allowedSwaps = vectorConfig.allowedSwaps.map((s) => {
  return { ...s, fromAssetId: getAddress(s.fromAssetId), toAssetId: getAddress(s.toAssetId) };
});
vectorConfig.rebalanceProfiles = vectorConfig.rebalanceProfiles.map((profile) => {
  // sanity checks
  const target = BigNumber.from(profile.target);
  if (target.gt(profile.reclaimThreshold)) {
    throw new Error("Rebalance target must be less than reclaim threshold");
  }

  if (target.lt(profile.collateralizeThreshold) && !target.isZero()) {
    throw new Error("Rebalance target must be larger than collateralizeThreshold or 0");
  }

  // checksum
  return {
    ...profile,
    assetId: getAddress(profile.assetId),
  };
});

export const routerWallet = Wallet.fromMnemonic(mnemonic);
export const routerSigner = new ChannelSigner(routerWallet.privateKey);

export const config = {
  dbUrl,
  ...vectorConfig,
  mnemonic,
} as Omit<VectorRouterConfig, "mnemonic"> & { mnemonic: string };
