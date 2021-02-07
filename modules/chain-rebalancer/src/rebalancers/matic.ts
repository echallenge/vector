import { MaticPOSClient } from "@maticnetwork/maticjs";
import { ChannelSigner } from "@connext/vector-utils";
import { BigNumber, constants, Contract, providers, utils, Wallet } from "ethers";
import { ERC20Abi } from "@connext/vector-types";
import HDWalletProvider from "@truffle/hdwallet-provider";
import WebSocket from "ws";

import { config, routerWallet } from "../config";

// const ETH_CHAIN_ID = 1;
// const MATIC_CHAIN_ID = 137;
const ETH_CHAIN_ID = 5;
const MATIC_CHAIN_ID = 80001;

const parentProvider = config.chainProviders[ETH_CHAIN_ID];
const maticProvider = config.chainProviders[MATIC_CHAIN_ID];

const parentWallet = new HDWalletProvider(routerWallet.privateKey, parentProvider);
const maticWallet = new HDWalletProvider(routerWallet.privateKey, maticProvider);

const parentEthProvider = new providers.JsonRpcProvider(parentProvider);
const maticEthProvider = new providers.JsonRpcProvider(parentProvider);

const maticPOSClient = new MaticPOSClient({
  network: "mainnet",
  version: "v1",
  parentWallet,
  maticWallet,
});

// For Mumbai
const ws = new WebSocket("wss://ws-mumbai.matic.today/");
// For Matic mainnet: wss://ws-mainnet.matic.network/

// Param1 - user address
// Param2 - contract address on main chain
// Param3 - amount deposited on main chain
// Param4 - child chain manager proxy address (0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa for mainnet)
// checkDepositStatus(
//   "0xFd71Dc9721d9ddCF0480A582927c3dCd42f3064C",
//   "0x47195A03fC3Fc2881D084e8Dc03bD19BE8474E46",
//   "1000000000000000000",
//   "0xb5505a6d998549090530911180f38aC5130101c6",
// )

const childChainManagerProxy = "0xb5505a6d998549090530911180f38aC5130101c6";

async function checkDepositStatus(userAccount: string, rootToken: string, depositAmount: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => {
      ws.send(
        `{"id": 1, "method": "eth_subscribe", "params": ["newDeposits", {"Contract": ${childChainManagerProxy}}]}`,
      );

      ws.on("message", (msg) => {
        console.log("msg: ", msg);
        const parsedMsg = JSON.parse(msg.toString());
        console.log("parsedMsg: ", parsedMsg);
        if (parsedMsg && parsedMsg.params && parsedMsg.params.result && parsedMsg.params.result.Data) {
          const fullData = parsedMsg.params.result.Data;
          console.log("fullData: ", fullData);
          const { 0: syncType, 1: syncData } = utils.defaultAbiCoder.decode(["bytes32", "bytes"], fullData);

          // check if sync is of deposit type (keccak256("DEPOSIT"))
          const depositType = "0x87a7811f4bfedea3d341ad165680ae306b01aaeacc205d227629cf157dd9f821";
          if (syncType.toLowerCase() === depositType.toLowerCase()) {
            const { 0: userAddress, 1: rootTokenAddress, 2: depositData } = utils.defaultAbiCoder.decode(
              ["address", "address", "bytes"],
              syncData,
            );

            // depositData can be further decoded to get amount, tokenId etc. based on token type
            // For ERC20 tokens
            const { 0: amount } = utils.defaultAbiCoder.decode(["uint256"], depositData);
            if (
              userAddress.toLowerCase() === userAccount.toLowerCase() &&
              rootToken.toLowerCase() === rootTokenAddress.toLowerCase() &&
              depositAmount === amount
            ) {
              resolve(true);
            }
          }
        }
      });

      ws.on("error", () => {
        reject(false);
      });

      ws.on("close", () => {
        reject(false);
      });
    });
  });
}

export const bridgeToMatic = async (
  amountToBridge: BigNumber,
  assetId: string,
  maticPOSClient: MaticPOSClient,
): Promise<{ txHash: string }> => {
  await maticPOSClient.approveERC20ForDeposit(assetId, amountToBridge, {
    from: routerSigner.address,
  });
  await maticPOSClient.depositERC20ForUser(assetId, routerSigner.address, amountToBridge, {
    from: routerSigner.address,
    gasPrice: "10000000000",
  });
  return { txHash: "" };
};

export const bridgeToEth = async (
  amountToBridge: BigNumber,
  assetId: string,
  maticPOSClient: MaticPOSClient,
): Promise<{ txHash: string }> => {
  return { txHash: "" };
};
