import { NextRequest, NextResponse } from "next/server";
import { LlmConfig, LlmQuotaError, chatStream, defaultLlmConfig } from "@/lib/llm";
import { buildRoastMessages } from "@/lib/prompt";
import type { ScanResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ByoKey {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

interface RoastBody {
  scan?: ScanResult;
  byoKey?: ByoKey;
}

function resolveConfig(byo?: ByoKey): LlmConfig | null {
  if (byo?.apiKey && byo.baseURL && byo.model) {
    return { baseURL: byo.baseURL, apiKey: byo.apiKey, model: byo.model };
  }
  return defaultLlmConfig();
}

export async function POST(req: NextRequest) {
  let body: RoastBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const scan = body.scan;
  if (!scan?.metrics || !scan.scoring) {
    return NextResponse.json({ error: "missing_scan" }, { status: 400 });
  }

  const config = resolveConfig(body.byoKey);
  if (!config) {
    // No operator key configured and no BYO key supplied.
    return NextResponse.json(
      { error: "no_llm_configured", useByoKey: true },
      { status: 400 },
    );
  }

  const messages = buildRoastMessages(scan);
  const generator = chatStream(config, messages);

  // Pull the first token up-front so quota/auth failures surface as a JSON
  // status code (the client then prompts for a BYO key) instead of a broken
  // 200 stream.
  let first: IteratorResult<string>;
  try {
    first = await generator.next();
  } catch (e) {
    if (e instanceof LlmQuotaError) {
      return NextResponse.json(
        { error: "llm_quota", useByoKey: true, status: e.status },
        { status: 402 },
      );
    }
    console.error("roast failed:", e);
    return NextResponse.json({ error: "roast_failed" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) {
          controller.enqueue(encoder.encode(first.value));
        }
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        console.error("roast stream error:", e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
