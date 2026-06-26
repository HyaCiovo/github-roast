"use client";

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { tierStyle } from "@/lib/tier";
import type { ScanResult } from "@/lib/types";
import {
  ByoKeyConfig,
  ByoKeyModal,
  loadByoKey,
} from "./ByoKeyModal";
import { Turnstile, turnstileEnabled } from "./Turnstile";

const SCAN_ERRORS: Record<string, string> = {
  invalid_username: "这不像个 GitHub 用户名，检查一下？",
  account_not_found: "查无此号 —— 拼写没错吧？",
  turnstile_failed: "人机校验没过，刷新页面重试。",
  rate_limited: "手速太快了，喘口气，一分钟后再来。",
  github_rate_limited: "GitHub 接口暂时被打满了，缓一会儿再试。",
  scan_failed: "扫描翻车了，稍后再试。",
};

export function Roaster() {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [roasting, setRoasting] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [byoOpen, setByoOpen] = useState(false);
  const [byoReason, setByoReason] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const runRoast = useCallback(async (scanResult: ScanResult) => {
    setRoasting(true);
    setReport("");
    const byoKey: ByoKeyConfig | null = loadByoKey();
    try {
      const res = await fetch("/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan: scanResult, byoKey }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if (data?.useByoKey) {
          setByoReason(
            data.error === "llm_quota"
              ? "免费额度用完了 😵 填入你自己的 API Key 继续毒舌（OpenAI / OpenRouter / Groq 都行）。"
              : "服务端还没配默认模型，填入你自己的 API Key 即可开评。",
          );
          setByoOpen(true);
          setRoasting(false);
          return;
        }
        setError("毒舌生成失败，稍后再试或换用自己的 Key。");
        setRoasting(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setReport(acc);
      }
    } catch {
      setError("网络中断，毒舌没说完。");
    } finally {
      setRoasting(false);
    }
  }, []);

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!username.trim() || scanning || roasting) return;
      if (turnstileEnabled() && !token) {
        setError("请先完成下方的人机校验。");
        return;
      }
      setError("");
      setScan(null);
      setReport("");
      setScanning(true);
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), turnstileToken: token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(SCAN_ERRORS[data?.error] ?? "扫描失败，稍后再试。");
          setScanning(false);
          return;
        }
        const result = data as ScanResult;
        setScan(result);
        setScanning(false);
        void runRoast(result);
        setTimeout(
          () => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          100,
        );
      } catch {
        setError("网络出错，连 GitHub 都连不上。");
        setScanning(false);
      }
    },
    [username, token, scanning, roasting, runRoast],
  );

  const shareText = scan
    ? `我的 GitHub 含金量被审判了：${scan.scoring.final_score}/100 · ${scan.scoring.tier}（${scan.scoring.tier_label}）。来测测你的 👉`
    : "";

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(
        `${shareText}\n${typeof window !== "undefined" ? window.location.href : ""}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const style = scan ? tierStyle(scan.scoring.tier) : null;

  return (
    <div className="w-full max-w-2xl">
      {/* Input */}
      <form onSubmit={submit} className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1.5 focus-within:border-orange-500/60">
          <span className="pl-3 text-zinc-500">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="输入 GitHub 用户名或主页链接"
            className="flex-1 bg-transparent px-1 py-2 text-base outline-none placeholder:text-zinc-600"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={scanning || roasting || !username.trim()}
            className="rounded-lg bg-orange-600 px-5 py-2 font-medium text-white transition hover:bg-orange-500 disabled:opacity-40"
          >
            {scanning ? "审判中…" : "开始审判"}
          </button>
        </div>
        <Turnstile onToken={setToken} />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="button"
          onClick={() => {
            setByoReason(undefined);
            setByoOpen(true);
          }}
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          用自己的模型 / API Key
        </button>
      </form>

      {/* Scanning skeleton */}
      {scanning && (
        <div className="mt-10 animate-pulse text-center text-zinc-500">
          正在扒 {username} 的老底…读 commit、查 PR、数 star、抓刷量痕迹
        </div>
      )}

      {/* Score reveal */}
      {scan && style && (
        <div ref={reportRef} className="mt-10">
          <div
            className={`animate-pop mx-auto flex max-w-md flex-col items-center rounded-2xl border bg-white/[0.03] p-6 text-center ring-1 ${style.ring}`}
            style={{ boxShadow: `0 0 80px -20px ${style.glow}` }}
          >
            <a
              href={scan.metrics.profile_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              @{scan.metrics.username}
            </a>
            <div className={`mt-2 text-6xl font-black tabular-nums ${style.text}`}>
              {scan.scoring.final_score}
              <span className="text-2xl text-zinc-600">/100</span>
            </div>
            <div className={`mt-1 text-2xl font-bold ${style.text}`}>
              {style.emoji} {scan.scoring.tier}
            </div>
            <div className="mt-1 text-sm text-zinc-400">{scan.scoring.tier_label}</div>

            <button
              onClick={copyShare}
              className="mt-4 rounded-full border border-white/10 px-4 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
            >
              {copied ? "已复制 ✓" : "复制分享文案"}
            </button>
          </div>

          {/* Roast report */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            {report ? (
              <div
                className={`report text-[0.95rem] text-zinc-200 ${roasting ? "caret" : ""}`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-center text-zinc-500">
                {roasting ? "毒舌正在酝酿…" : "准备生成点评"}
              </div>
            )}
          </div>

          {scan.metrics.days_since_last_activity === null && (
            <p className="mt-3 text-center text-xs text-zinc-600">
              注：评分仅基于公开信号，私有贡献不计入，可能低估私有组织的活跃员工。
            </p>
          )}
        </div>
      )}

      <ByoKeyModal
        open={byoOpen}
        reason={byoReason}
        onClose={() => setByoOpen(false)}
        onSave={(cfg) => {
          setByoOpen(false);
          if (cfg && scan) void runRoast(scan);
        }}
      />
    </div>
  );
}
