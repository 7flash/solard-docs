import { marketDatabase } from "../../../shared/market-db";

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get("mint")?.trim() ?? "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))
    return new Response("Invalid mint", { status: 400 });
  const image = marketDatabase().readTokenImage(mint);
  if (!image) return new Response("Image not indexed", { status: 404 });
  return new Response(image.bytes, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      ETag: `W/\"${mint}-${image.updatedAtMs}\"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
