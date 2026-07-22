"use client";

import { WalletAdapterProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo } from "react";

export function WalletAdapterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <WalletAdapterProvider wallets={wallets} autoConnect>
      <WalletModalProvider>{children}</WalletModalProvider>
    </WalletAdapterProvider>
  );
}
