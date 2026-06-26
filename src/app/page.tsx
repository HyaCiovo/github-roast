import { Roaster } from "@/components/Roaster";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-5 py-14 sm:py-20">
      <header className="mb-10 flex flex-col items-center text-center">
        <div className="mb-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
          🔥 公开数据 · 30 秒出分 · 专治刷量号
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          毒舌 <span className="text-orange-500">GitHub</span> 评分
        </h1>
        <p className="mt-3 max-w-md text-zinc-400">
          输入一个 GitHub 账号，得到 0–100 分的价值与信任评分，
          外加一句扎心又有梗的毒舌点评。AI 机器人、收藏夹开发者、自产自销刷量号，无所遁形。
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          {[
            ["🏆 夯", "text-amber-300"],
            ["💪 人上人", "text-emerald-300"],
            ["🫥 NPC", "text-slate-300"],
            ["💀 拉完了", "text-rose-400"],
          ].map(([label, cls]) => (
            <span
              key={label}
              className={`rounded-full border border-white/10 px-2.5 py-1 ${cls}`}
            >
              {label}
            </span>
          ))}
        </div>
      </header>

      <Roaster />

      <footer className="mt-20 max-w-xl text-center text-xs leading-relaxed text-zinc-600">
        <p>
          本站仅基于 GitHub <strong>公开数据</strong>自动生成评分与点评，吐槽的是账号的公开行为与数据，
          非针对个人。结果不构成对任何人的事实认定，请勿用于骚扰。
        </p>
        <p className="mt-2">
          评分核心开源于{" "}
          <code className="text-zinc-400">github-account-value</code> 技能 ·
          自带 Key 仅存于你的浏览器本地。
        </p>
      </footer>
    </main>
  );
}
