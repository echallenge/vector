import { utils } from "ethers";
import { fastify } from "fastify";
import pino from "pino";
import fastifyCors from "fastify-cors";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";
import { ERC20Abi } from "@connext/vector-types";

import { config } from "./config";

export const logger = pino({ name: "Chain-Rebalancer" });

const server = fastify({ logger, pluginTimeout: 300_000 });
server.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "PUT", "POST", "OPTIONS"],
  preflightContinue: true,
});

export const getOnchainBalanceForAsset = async (
  assetId: string,
  balanceOf: string,
  provider: JsonRpcProvider,
): Promise<BigNumber> => {
  if (assetId === AddressZero) {
    return provider.getBalance(balanceOf);
  } else {
    return new Contract(assetId, ERC20Abi, provider).balanceOf(balanceOf);
  }
};

export const rebalanceHandler = async (): Promise<APIGatewayProxyResult> => {
  // check router signer address balances against ratios
  for (const swap of config.allowedSwaps) {
    const parentBalance = await getOnchainBalanceForAsset(
      rebalance.ethAssetId,
      routerSigner.address,
      parentEthProvider,
    );
    console.log("parentBalance: ", parentBalance.toString());

    const maticBalance = await getOnchainBalanceForAsset(
      rebalance.maticAssetId,
      routerSigner.address,
      maticEthProvider,
    );
    console.log("maticBalance: ", maticBalance.toString());

    let ratio: number;
    if (parentBalance.gt(maticBalance)) {
      ratio = parseFloat(utils.formatEther(parentBalance)) / parseFloat(utils.formatEther(maticBalance));
    } else {
      ratio = parseFloat(utils.formatEther(parentBalance)) / parseFloat(utils.formatEther(maticBalance));
    }
    console.log("ratio: ", ratio);

    const difference = ratio - 1;
    console.log("difference: ", difference);
    const discrepancyPct = difference * 100;

    if (discrepancyPct > rebalance.allowedDeviationPct) {
      const total = parentBalance.add(maticBalance);
      console.log("total: ", total.toString());
      const target = total.div(2);
      console.log("target: ", target.toString());
      let res;
      if (parentBalance.gt(maticBalance)) {
        const amountToBridge = parentBalance.sub(target);
        console.log("amountToBridge: ", amountToBridge.toString());
        res = await bridgeToMatic(amountToBridge, rebalance.ethAssetId, maticPOSClient);
      } else {
        const amountToBridge = maticBalance.sub(target);
        console.log("amountToBridge: ", amountToBridge.toString());
        res = await bridgeToEth(amountToBridge, rebalance.ethAssetId);
      }
    }
  }

  // rebalance between matic/mainnet as necessary

  // https://docs.matic.network/docs/develop/ethereum-matic/pos/using-sdk/erc20

  return {};
};

server.addHook("onReady", async () => {
  console.log("Ready");
});

server.listen(8000, "0.0.0.0", (err, address) => {
  if (err) {
    logger.error(err);
    process.exit(1);
  }
  logger.info(`Server listening at ${address}`);
});
