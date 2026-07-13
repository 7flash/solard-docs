const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23000'/%3E%3Cpath d='M10.5 4h16l-3.4 5h-16z' fill='%23fff'/%3E%3Cpath d='M7.1 13.5h16l3.4 5h-16z' fill='%23fff'/%3E%3Cpath d='M10.5 23h16l-3.4 5h-16z' fill='%23fff'/%3E%3C/svg%3E";

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <meta
          name="description"
          content="Local-first Solana trading terminal and multi-wallet CLI/SDK. Direct venue transactions, no Jupiter, no platform fees."
        />
        <meta property="og:title" content="SOLARD — trading terminal" />
        <meta
          property="og:description"
          content="Runs on your machine. Your keys, your RPC, direct venue transactions, 0% platform fees."
        />
        <title>SOLARD — trading terminal</title>
        <link rel="icon" href={favicon} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
