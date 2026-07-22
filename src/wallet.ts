import { PublicKey } from "@solana/web3.js";
import { errorCode, errorMessage, errorRecord } from "./observability/error";
import type {
  InjectedWallet,
  PublicKeyLike,
  WalletOption,
  WalletProviderName,
} from "./types";

declare global {
  interface Window {
    phantom?: { solana?: InjectedWallet };
    solana?: InjectedWallet;
    solflare?: InjectedWallet;
    backpack?: { solana?: InjectedWallet };
    xnft?: { solana?: InjectedWallet };
  }
}

export type WalletConnectionResult = {
  publicKey: PublicKey;
  attemptId: string;
  method: "already-connected" | "connect" | "request";
};

export class WalletConnectionError extends Error {
  readonly code?: string | number;
  readonly data?: unknown;
  readonly attemptId: string;
  readonly providerName: string;
  readonly method: string;

  constructor(params: {
    providerName: string;
    method: string;
    attemptId: string;
    error: unknown;
    previousError?: unknown;
  }) {
    const detail = errorRecord(params.error);
    const previous = params.previousError
      ? errorRecord(params.previousError)
      : null;
    const code = detail.code ?? previous?.code;
    const rawMessage =
      detail.message || previous?.message || "Wallet connection failed.";
    super(
      `${params.providerName} connection failed${code !== undefined ? ` (${code})` : ""}: ${rawMessage}`,
      { cause: params.error },
    );
    this.name = "WalletConnectionError";
    this.code = code;
    this.data = detail.data ?? previous?.data;
    this.attemptId = params.attemptId;
    this.providerName = params.providerName;
    this.method = params.method;
  }
}

type PendingConnection = {
  mode: "prompt" | "trusted";
  promise: Promise<WalletConnectionResult>;
};

const pendingConnections = new WeakMap<InjectedWallet, PendingConnection>();
const connectedKeys = new WeakMap<InjectedWallet, PublicKey>();

function attemptId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function isUsableProvider(
  provider: InjectedWallet | undefined,
): provider is InjectedWallet {
  return Boolean(
    provider &&
    typeof provider.connect === "function" &&
    typeof provider.signTransaction === "function",
  );
}

function isUserRejected(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === 4001 ||
    /user rejected|rejected the request|declined/i.test(errorMessage(error))
  );
}

function shouldTryRequestFallback(
  error: unknown,
  provider: InjectedWallet,
): boolean {
  // Phantom documents connect() and request({ method: 'connect' }) as alternatives.
  // Calling both after an internal Phantom failure can create a second pending request,
  // so Phantom always stays on the recommended connect() path.
  if (
    provider.isPhantom ||
    typeof provider.request !== "function" ||
    isUserRejected(error)
  )
    return false;
  const code = errorCode(error);
  if (code === -32002) return false;
  return true;
}

export function publicKeyFromLike(
  value: PublicKeyLike | null | undefined,
): PublicKey | null {
  if (!value) return null;
  try {
    if (value instanceof PublicKey) return value;
    const stringValue =
      typeof value === "string"
        ? value
        : typeof value.toBase58 === "function"
          ? value.toBase58()
          : value.toString();
    return new PublicKey(stringValue);
  } catch {
    return null;
  }
}

export function rememberWalletPublicKey(
  provider: InjectedWallet,
  value: PublicKeyLike | PublicKey | null | undefined,
): PublicKey | null {
  const publicKey = publicKeyFromLike(value);
  if (publicKey) connectedKeys.set(provider, publicKey);
  else connectedKeys.delete(provider);
  return publicKey;
}

export function walletPublicKey(
  provider: InjectedWallet | null | undefined,
): PublicKey | null {
  if (!provider) return null;
  return connectedKeys.get(provider) || publicKeyFromLike(provider.publicKey);
}

export function providerName(
  provider: InjectedWallet,
): WalletProviderName | "wallet" {
  if (provider.isPhantom) return "phantom";
  if (provider.isSolflare) return "solflare";
  if (provider.isBackpack) return "backpack";
  return "wallet";
}

export function discoverWallets(): WalletOption[] {
  if (typeof window === "undefined") return [];

  const options: WalletOption[] = [];
  const seen = new Set<InjectedWallet>();
  const add = (
    name: WalletProviderName,
    label: string,
    provider: InjectedWallet | undefined,
    guard?: (candidate: InjectedWallet) => boolean,
  ) => {
    if (!isUsableProvider(provider) || seen.has(provider)) return;
    if (guard && !guard(provider)) return;
    seen.add(provider);
    options.push({ name, label, provider });
  };

  const phantom =
    window.phantom?.solana ||
    (window.solana?.isPhantom ? window.solana : undefined);
  const solflare = window.solflare;
  const backpack = window.backpack?.solana || window.xnft?.solana;

  add(
    "phantom",
    "Phantom",
    phantom,
    (provider) => provider.isPhantom !== false,
  );
  add(
    "solflare",
    "Solflare",
    solflare,
    (provider) => provider.isSolflare !== false,
  );
  add("backpack", "Backpack", backpack);
  return options;
}

export async function waitForWallets(
  timeoutMs = 1_500,
): Promise<WalletOption[]> {
  const started = Date.now();
  let wallets = discoverWallets();
  while (wallets.length === 0 && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    wallets = discoverWallets();
  }
  return wallets;
}

function keyFromConnectionResult(
  provider: InjectedWallet,
  result: unknown,
): PublicKey | null {
  const resultKey =
    result && typeof result === "object" && "publicKey" in result
      ? publicKeyFromLike((result as { publicKey?: PublicKeyLike }).publicKey)
      : null;
  return resultKey || publicKeyFromLike(provider.publicKey);
}

async function settleConnectedKey(
  provider: InjectedWallet,
  result: unknown,
  timeoutMs = 1_200,
): Promise<PublicKey> {
  const immediate = keyFromConnectionResult(provider, result);
  if (immediate) return immediate;

  return new Promise<PublicKey>((resolve, reject) => {
    let timer: number | null = null;
    let poll: number | null = null;
    const cleanup = () => {
      if (timer !== null) window.clearTimeout(timer);
      if (poll !== null) window.clearInterval(poll);
      provider.off?.("connect", onConnect);
    };
    const finish = (value?: unknown) => {
      const publicKey =
        publicKeyFromLike(value as PublicKeyLike) ||
        publicKeyFromLike(provider.publicKey);
      if (!publicKey) return false;
      cleanup();
      resolve(publicKey);
      return true;
    };
    const onConnect = (value: unknown) => {
      finish(value);
    };

    provider.on?.("connect", onConnect);
    poll = window.setInterval(() => {
      finish(provider.publicKey);
    }, 50);
    timer = window.setTimeout(() => {
      cleanup();
      reject(
        new Error("The wallet connected without exposing a Solana public key."),
      );
    }, timeoutMs);
  });
}

function callConnect(
  provider: InjectedWallet,
  onlyIfTrusted: boolean,
): Promise<unknown> {
  try {
    return Promise.resolve(
      onlyIfTrusted
        ? provider.connect({ onlyIfTrusted: true })
        : provider.connect(),
    );
  } catch (error) {
    return Promise.reject(error);
  }
}

function callRequestConnect(provider: InjectedWallet): Promise<unknown> {
  try {
    if (!provider.request)
      return Promise.reject(
        new Error("Wallet JSON-RPC request API is unavailable."),
      );
    return Promise.resolve(provider.request({ method: "connect" }));
  } catch (error) {
    return Promise.reject(error);
  }
}

export function beginInjectedWalletConnection(
  provider: InjectedWallet,
  onlyIfTrusted = false,
  label?: string,
): Promise<WalletConnectionResult> {
  const existingKey = walletPublicKey(provider);
  if (provider.isConnected && existingKey) {
    rememberWalletPublicKey(provider, existingKey);
    return Promise.resolve({
      publicKey: existingKey,
      attemptId: attemptId(),
      method: "already-connected",
    });
  }

  const mode: PendingConnection["mode"] = onlyIfTrusted ? "trusted" : "prompt";
  const current = pendingConnections.get(provider);
  if (current) {
    if (current.mode === mode || current.mode === "prompt")
      return current.promise;
    return current.promise.catch(() =>
      beginInjectedWalletConnection(provider, false, label),
    );
  }

  const id = attemptId();
  const name = label || providerName(provider);
  const firstCall = callConnect(provider, onlyIfTrusted);
  const promise = firstCall
    .then(async (result) => {
      const publicKey = await settleConnectedKey(provider, result);
      rememberWalletPublicKey(provider, publicKey);
      return { publicKey, attemptId: id, method: "connect" as const };
    })
    .catch(async (firstError) => {
      if (onlyIfTrusted || !shouldTryRequestFallback(firstError, provider)) {
        throw new WalletConnectionError({
          providerName: name,
          method: "connect",
          attemptId: id,
          error: firstError,
        });
      }

      try {
        const result = await callRequestConnect(provider);
        const publicKey = await settleConnectedKey(provider, result);
        rememberWalletPublicKey(provider, publicKey);
        return { publicKey, attemptId: id, method: "request" as const };
      } catch (secondError) {
        throw new WalletConnectionError({
          providerName: name,
          method: "connect + request fallback",
          attemptId: id,
          error: secondError,
          previousError: firstError,
        });
      }
    })
    .finally(() => {
      const active = pendingConnections.get(provider);
      if (active?.promise === promise) pendingConnections.delete(provider);
    });

  pendingConnections.set(provider, { mode, promise });
  return promise;
}

export async function resetInjectedWalletSession(
  provider: InjectedWallet,
): Promise<void> {
  pendingConnections.delete(provider);
  connectedKeys.delete(provider);
  try {
    await provider.disconnect?.();
  } finally {
    pendingConnections.delete(provider);
    connectedKeys.delete(provider);
  }
}

export async function connectInjectedWallet(
  provider: InjectedWallet,
  onlyIfTrusted = false,
  label?: string,
): Promise<PublicKey> {
  return (await beginInjectedWalletConnection(provider, onlyIfTrusted, label))
    .publicKey;
}

export function walletDiagnostic(
  provider: InjectedWallet | undefined,
): Record<string, unknown> {
  return {
    detected: Boolean(provider),
    provider: provider ? providerName(provider) : null,
    isConnected: Boolean(provider?.isConnected),
    hasPublicKey: Boolean(walletPublicKey(provider)),
    hasConnect: typeof provider?.connect === "function",
    hasRequest: typeof provider?.request === "function",
    hasSignTransaction: typeof provider?.signTransaction === "function",
    origin: typeof window !== "undefined" ? window.location.origin : null,
    secureContext:
      typeof window !== "undefined" ? window.isSecureContext : null,
    topLevel: typeof window !== "undefined" ? window.top === window.self : null,
  };
}

export function walletInstallUrl(name: WalletProviderName): string {
  switch (name) {
    case "phantom":
      return "https://phantom.com/download";
    case "solflare":
      return "https://solflare.com/download";
    case "backpack":
      return "https://backpack.app/download";
  }
}
