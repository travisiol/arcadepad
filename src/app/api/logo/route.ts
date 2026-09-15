import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Pins a logo to IPFS through Pinata (PINATA_JWT). Pons' own upload
 * endpoint is gated by Origin, so the pad brings its own pinning; without
 * a key the form asks for an https URL instead (501).
 */
export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT?.trim();
  if (!jwt) return NextResponse.json({ error: "logo upload is not configured; paste an https url" }, { status: 501 });
  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "no image" }, { status: 400 });
  if (file.size > 5_000_000) return NextResponse.json({ error: "5 MB max" }, { status: 413 });
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return NextResponse.json({ error: "png, jpeg, webp or gif" }, { status: 415 });
  const body = new FormData();
  body.append("file", file, file.name || "logo");
  body.append("pinataMetadata", JSON.stringify({ name: `arcadepad-${Date.now()}` }));
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", { method: "POST", headers: { authorization: `Bearer ${jwt}` }, body });
  if (!res.ok) return NextResponse.json({ error: `pinata refused (${res.status})` }, { status: 502 });
  const json = (await res.json()) as { IpfsHash?: string };
  if (!json.IpfsHash) return NextResponse.json({ error: "pinata returned no hash" }, { status: 502 });
  return NextResponse.json({ cid: json.IpfsHash, uri: `ipfs://${json.IpfsHash}`, url: `https://gateway.pinata.cloud/ipfs/${json.IpfsHash}` });
}
