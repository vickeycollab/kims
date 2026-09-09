import { get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";

type Key = { pinHash: string; answers: string[] };
const KEY_PREFIX = "private/answer-key/";

function compact(value: unknown) {
  return String(value ?? "").replace(/[\s,]/g, "").split("").filter(Boolean).map((item) => item.toUpperCase());
}
async function hash(pin: string) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function readBlobJson(blob: { url: string }) {
  const value: any = await get(blob.url);
  if (!value) return null;
  return JSON.parse(await new Response(value.stream).text());
}
async function currentKey(): Promise<Key | null> {
  const { blobs } = await list({ prefix: KEY_PREFIX, limit: 100 });
  const newest = blobs.sort((a, b) => b.pathname.localeCompare(a.pathname))[0];
  return newest ? readBlobJson(newest) : null;
}
async function saveKey(key: Key) {
  await put(`${KEY_PREFIX}${Date.now()}-${crypto.randomUUID()}.json`, JSON.stringify(key), { access: "private", contentType: "application/json" });
}
function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "저장소를 사용할 수 없습니다.";
  if (message.includes("BLOB_READ_WRITE_TOKEN")) return NextResponse.json({ error: "저장소가 아직 연결되지 않았습니다. 관리자에게 Vercel Blob 연결을 요청해 주세요." }, { status: 503 });
  return NextResponse.json({ error: "처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export async function GET() {
  try {
    const key = await currentKey();
    return NextResponse.json({ configured: Boolean(key), questions: key?.answers.map((_, index) => index + 1) ?? [] });
  } catch (error) { return responseError(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const key = await currentKey();

    if (body.action === "setup") {
      const pin = String(body.pin ?? "").trim();
      if (key) return NextResponse.json({ error: "관리자 코드가 이미 설정되어 있습니다." }, { status: 409 });
      if (pin.length < 4) return NextResponse.json({ error: "관리자 코드는 4자 이상이어야 합니다." }, { status: 400 });
      await saveKey({ pinHash: await hash(pin), answers: [] });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "check") {
      if (!key?.answers.length) return NextResponse.json({ error: "관리자가 아직 답안표를 등록하지 않았습니다." }, { status: 400 });
      const submitted = compact(body.answers);
      const wrong = submitted.flatMap((answer, index) => key.answers[index] && key.answers[index] !== answer ? [index + 1] : []);
      await put(`private/submissions/${Date.now()}-${crypto.randomUUID()}.json`, JSON.stringify({ wrong }), { access: "private", contentType: "application/json" });
      return NextResponse.json({ wrong });
    }

    if (!key || typeof body.pin !== "string" || key.pinHash !== await hash(body.pin)) {
      return NextResponse.json({ error: "관리자 코드가 맞지 않습니다." }, { status: 401 });
    }

    if (body.action === "saveKeys") {
      const answers = compact(body.answers);
      if (!answers.length) return NextResponse.json({ error: "정답을 한 개 이상 입력해 주세요." }, { status: 400 });
      await saveKey({ pinHash: key.pinHash, answers });
      return NextResponse.json({ ok: true, questions: answers.length });
    }

    if (body.action === "stats") {
      const { blobs } = await list({ prefix: "private/submissions/", limit: 1000 });
      const counts = new Map<number, number>();
      for (const blob of blobs) {
        const item = await readBlobJson(blob) as { wrong?: number[] };
        for (const question of item?.wrong ?? []) counts.set(question, (counts.get(question) ?? 0) + 1);
      }
      return NextResponse.json({ stats: [...counts.entries()].map(([question, count]) => ({ question, count })).sort((a, b) => b.count - a.count || a.question - b.question) });
    }

    return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (error) { return responseError(error); }
}
