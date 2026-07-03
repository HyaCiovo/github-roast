import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";
export const revalidate = 86400;

/**
 * robots.txt as a route handler (not MetadataRoute.Robots) so we can emit
 * Content-Signal, schemamap, and per-agent tiers that the metadata API can't.
 *
 * Policy: welcome the search/answer AI crawlers AND CommonCrawl (CCBot) — being
 * in the training substrate is the whole growth goal, and CCBot is well-behaved.
 * Block only Bytespider, the most aggressive scraper. `/api/` stays disallowed
 * (it burns GitHub/LLM/DB budget), except the OG image + card routes, which are
 * CDN-cached and wanted in social/answer previews.
 */
const ALLOWED_AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export function GET() {
  const lines: string[] = [];

  // Explicit allow tier for AI crawlers we welcome.
  for (const bot of ALLOWED_AI_BOTS) {
    lines.push(`User-agent: ${bot}`, "Allow: /", "");
  }

  // Block the single most aggressive scraper outright.
  lines.push("User-agent: Bytespider", "Disallow: /", "");

  // Everyone else: open, but keep the budget-burning API private (images allowed).
  lines.push(
    "User-agent: *",
    "Allow: /",
    "Allow: /api/og/",
    "Allow: /api/card/",
    "Disallow: /api/",
    "",
    // Cloudflare Content Signals — purpose-based permissions. We opt into search,
    // AI answer input, AND AI training (the growth goal).
    "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
    "",
  );

  lines.push(
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    // NLWeb Schema Feeds: point at the structured-data feed (the OpenAPI spec).
    `Schemamap: ${SITE_URL}/openapi.json`,
    `Host: ${SITE_URL}`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400",
    },
  });
}
