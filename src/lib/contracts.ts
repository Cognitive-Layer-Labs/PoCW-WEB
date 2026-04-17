/**
 * PoCW contract ABIs and chain configuration.
 *
 * Addresses are read from NEXT_PUBLIC_CONTROLLER_ADDRESS_<chainId>
 * and NEXT_PUBLIC_SBT_ADDRESS_<chainId> environment variables.
 */

export const POCW_CONTROLLER_ABI = [
  {
    name: "verifyAndMint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "contentId", type: "uint256" },
      { name: "score", type: "uint256" },
      { name: "expiry", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "tokenUri", type: "string" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const POCW_SBT_ABI = [
  {
    name: "uri",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const ERROR_SELECTORS = {
  NonceAlreadyUsed: "0xNonceAlreadyUsed",
  SignatureExpired: "0xSignatureExpired",
  InvalidSignature: "0xInvalidSignature",
} as const;

export interface ChainDeploy {
  controllerAddress: `0x${string}`;
  sbtAddress: `0x${string}`;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

// Keep production-safe fallbacks for Base Sepolia in case build-time NEXT_PUBLIC_* vars
// are not injected by the deployment platform during static client bundling.
const BASE_SEPOLIA_FALLBACK: ChainDeploy = {
  controllerAddress: "0xC327B012811d88A27817fc7159A0a57Fb503e2AD",
  sbtAddress: "0x9E75B497411f3Eb85018591Ec865B82cC2B6409F",
};

function readAddressEnv(name: string, fallback: `0x${string}` = ZERO): `0x${string}` {
  const value = process.env[name];
  if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value as `0x${string}`;
  }
  return fallback;
}

/**
 * Known chain deployments. Add entries as contracts are deployed.
 * Uses NEXT_PUBLIC_ env vars which Next.js inlines at build time.
 */
const KNOWN_CHAINS: Record<number, ChainDeploy> = {
  31337: {
    controllerAddress: readAddressEnv("NEXT_PUBLIC_CONTROLLER_ADDRESS_31337"),
    sbtAddress: readAddressEnv("NEXT_PUBLIC_SBT_ADDRESS_31337"),
  },
  84532: {
    controllerAddress: readAddressEnv(
      "NEXT_PUBLIC_CONTROLLER_ADDRESS_84532",
      BASE_SEPOLIA_FALLBACK.controllerAddress
    ),
    sbtAddress: readAddressEnv(
      "NEXT_PUBLIC_SBT_ADDRESS_84532",
      BASE_SEPOLIA_FALLBACK.sbtAddress
    ),
  },
  8453: {
    controllerAddress: readAddressEnv("NEXT_PUBLIC_CONTROLLER_ADDRESS_8453"),
    sbtAddress: readAddressEnv("NEXT_PUBLIC_SBT_ADDRESS_8453"),
  },
};

export function getChainConfig(chainId: number): ChainDeploy {
  return KNOWN_CHAINS[chainId] ?? { controllerAddress: ZERO, sbtAddress: ZERO };
}
