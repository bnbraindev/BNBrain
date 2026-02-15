import type {
  ReportJSON, BiText, SocialLink, StatItem, SecurityItem,
  HolderDistribution, ContractInfo, BuySellData, Feature,
  IntelItem, CustomSection, ExchangeListing, SentimentData,
} from './types';

// ── Helpers ──────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return esc(s).replace(/'/g, '&#39;');
}

/** Sanitize href: only allow http/https protocols. Returns '#' for invalid URLs. */
function safeHref(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return esc(trimmed);
  // Relative paths are OK (e.g. #anchor)
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return esc(trimmed);
  return '#';
}

function bi(t: BiText | string): string {
  if (typeof t === 'string') return esc(t);
  return `<span class="lang-zh">${esc(t.zh)}</span><span class="lang-en">${esc(t.en)}</span>`;
}

function abbr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-7)}`;
}

function bscTokenUrl(addr: string) { return `https://bscscan.com/token/${addr}`; }
function bscAddrUrl(addr: string) { return `https://bscscan.com/address/${addr}`; }
function bscCodeUrl(addr: string) { return `https://bscscan.com/address/${addr}#code`; }
function bscHoldersUrl(addr: string) { return `https://bscscan.com/token/${addr}#balances`; }
function dexUrl(addr: string) { return `https://dexscreener.com/bsc/${addr}`; }

function riskClass(level: string): string {
  if (level === 'low') return 'low';
  if (level === 'high') return 'high';
  return 'med';
}

function riskColor(level: string): string {
  if (level === 'low') return 'var(--green)';
  if (level === 'high') return 'var(--red)';
  return 'var(--yellow)';
}

/** stroke-dashoffset for the risk ring (0=full, 176=empty) */
function ringOffset(score: number): number {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return Math.round(176 - pct * 176);
}

// ── Social icon SVGs ─────────────────────────────────────

const SOCIAL_ICONS: Record<string, string> = {
  website: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>',
  bscscan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
  dexscreener: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 5 5-9"/></svg>',
  discord: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z"/><path d="M7.5 7.5c3-.5 6-.5 9 0M7.5 16.5c3 .5 6 .5 9 0"/><path d="M15.5 17c0 1 1.5 3 2 3 1.5 0 2.833-1.667 3.5-3 .667-1.667.5-5.833-1.5-11.5C17.5 4 15.5 3.5 15.5 3.5l-1 2"/><path d="M8.5 17c0 1-1.5 3-2 3-1.5 0-2.833-1.667-3.5-3-.667-1.667-.5-5.833 1.5-11.5C6.5 4 8.5 3.5 8.5 3.5l1 2"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/></svg>',
  custom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
};

function socialLabel(link: SocialLink): string {
  if (link.label) return esc(link.label);
  const map: Record<string, BiText> = {
    website: { zh: '官网', en: 'Web' },
    telegram: { zh: '电报', en: 'TG' },
    bscscan: { zh: '浏览器', en: 'BscScan' },
    dexscreener: { zh: '行情', en: 'DexScreener' },
  };
  const bt = map[link.type];
  if (bt) return bi(bt);
  // capitalize first letter
  return esc(link.type.charAt(0).toUpperCase() + link.type.slice(1));
}

// ── Intel dot color ──────────────────────────────────────

const INTEL_COLORS: Record<string, string> = {
  exchanges: 'var(--green)',
  media: 'var(--blue)',
  sentiment: 'var(--purple)',
  audit: 'var(--yellow)',
  custom: 'var(--t2)',
};

// ── Section Renderers ────────────────────────────────────

function renderCSS(): string {
  return `*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
:root{
  --bg:#08090d;--bg2:#0c0e14;--bg3:#11131a;--bg4:#161922;
  --border:rgba(240,185,11,0.08);--border2:rgba(255,255,255,0.05);
  --shadow:none;--card-shadow:0 0 0 1px var(--border);
  --gold:#F0B90B;--gold2:#FFD666;--gold-dim:rgba(240,185,11,0.1);--gold-glow:rgba(240,185,11,0.25);
  --green:#00e6a7;--green-dim:rgba(0,230,167,0.1);
  --red:#ff4d6a;--red-dim:rgba(255,77,106,0.1);
  --yellow:#ffb020;--yellow-dim:rgba(255,176,32,0.1);
  --blue:#4da6ff;--blue-dim:rgba(77,166,255,0.1);
  --purple:#a78bfa;
  --t1:#f0f2f5;--t2:#8a93a6;--t3:#505a6e;
  --ring-bg:rgba(255,255,255,0.06);--bar-dim:rgba(255,255,255,0.06);
  --ctrl-bg:rgba(12,14,20,0.85);--ctrl-border:rgba(255,255,255,0.06);--ctrl-hover:rgba(255,255,255,0.04);
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;
  --mono:"SF Mono","JetBrains Mono","Fira Code",Consolas,monospace;
}
body{font-family:var(--font);background:var(--bg);color:var(--t1);line-height:1.5;min-height:100vh}
#theme-toggle,#lang-toggle{display:none}
.page{position:relative;min-height:100vh;background:var(--bg);color:var(--t1);transition:background .4s,color .3s}
.page::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 70% 50% at 50% -10%,var(--gold-glow),transparent 70%);opacity:.2;pointer-events:none;transition:opacity .4s}
.risk-bar{position:fixed;top:0;left:0;right:0;height:3px;z-index:100;transition:background .4s}
.risk-bar.low{background:linear-gradient(90deg,var(--green),var(--green) 40%,transparent)}
.risk-bar.med{background:linear-gradient(90deg,var(--yellow),var(--yellow) 40%,transparent)}
.risk-bar.high{background:linear-gradient(90deg,var(--red),var(--red) 40%,transparent)}
.ctrl{position:fixed;top:12px;right:14px;z-index:99;display:flex;align-items:center;gap:0;background:var(--ctrl-bg);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--ctrl-border);border-radius:10px;padding:3px;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:all .3s}
.ctrl-sep{width:1px;height:18px;background:var(--ctrl-border);margin:0 2px;flex-shrink:0}
.ctrl label,.ctrl-btn{display:flex;align-items:center;cursor:pointer;border-radius:7px;overflow:hidden}
.ctrl label span,.ctrl-btn{display:flex;align-items:center;justify-content:center;padding:5px 10px;font-size:11px;font-weight:600;color:var(--t3);transition:all .25s;border-radius:7px;line-height:1;min-width:32px}
.ctrl label span:hover,.ctrl-btn:hover{color:var(--t2);background:var(--ctrl-hover)}
.ctrl-btn{border:none;background:none;font-family:inherit;position:relative}
.ctrl-btn.ok{color:var(--gold)}
.ctrl-theme .t-sun{color:var(--t3)}
.ctrl-theme .t-moon{background:var(--gold);color:#000}
#theme-toggle:checked~.ctrl .ctrl-theme .t-sun{background:var(--gold);color:#000}
#theme-toggle:checked~.ctrl .ctrl-theme .t-moon{background:transparent;color:var(--t3)}
.ctrl-lang .l-zh{background:var(--gold);color:#000}
.ctrl-lang .l-en{color:var(--t3)}
#lang-toggle:checked~.ctrl .ctrl-lang .l-zh{background:transparent;color:var(--t3)}
#lang-toggle:checked~.ctrl .ctrl-lang .l-en{background:var(--gold);color:#000}
.lang-en{display:none}
#lang-toggle:checked~.page .lang-zh{display:none}
#lang-toggle:checked~.page .lang-en{display:revert}
#theme-toggle:checked~.page{--bg:#f4f5f7;--bg2:#ffffff;--bg3:#f0f1f4;--bg4:#e6e8ec;--border:rgba(0,0,0,0.06);--border2:rgba(0,0,0,0.04);--shadow:0 1px 3px rgba(0,0,0,0.04);--card-shadow:0 1px 4px rgba(0,0,0,0.07);--gold:#cc9c08;--gold2:#a68007;--gold-dim:rgba(204,156,8,0.07);--gold-glow:rgba(204,156,8,0.12);--green:#00b386;--green-dim:rgba(0,179,134,0.07);--red:#e03050;--red-dim:rgba(224,48,80,0.06);--yellow:#c88b00;--yellow-dim:rgba(200,139,0,0.06);--blue:#2d7fd4;--blue-dim:rgba(45,127,212,0.06);--t1:#1a1d26;--t2:#5a6477;--t3:#8b95a8;--ring-bg:rgba(0,0,0,0.06);--bar-dim:rgba(0,0,0,0.06)}
#theme-toggle:checked~.page{background:var(--bg)}
#theme-toggle:checked~.page::before{opacity:0}
#theme-toggle:checked~.ctrl{--ctrl-bg:rgba(255,255,255,0.9);--ctrl-border:rgba(0,0,0,0.08);--ctrl-hover:rgba(0,0,0,0.03);box-shadow:0 2px 12px rgba(0,0,0,0.08)}
.wrap{max-width:920px;margin:0 auto;padding:16px 12px 32px}
.hdr{padding:20px 0 16px;border-bottom:1px solid var(--border);margin-bottom:12px}
.hdr-top{display:flex;align-items:center;justify-content:space-between}
.hdr-left{display:flex;align-items:center;gap:14px}
.hdr-logo{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--gold),#e6a800);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#000;box-shadow:0 0 20px var(--gold-glow)}
.hdr-info h1{font-size:20px;font-weight:700;line-height:1.2}
.hdr-info h1 span{color:var(--gold)}
.hdr-meta{display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap}
.hdr-chain{background:var(--gold);color:#000;padding:1px 8px;border-radius:4px;font-size:10px;font-weight:800;letter-spacing:.5px}
.hdr-addr{font-family:var(--mono);font-size:11px;color:var(--t3)}
.hdr-time{font-size:10px;color:var(--t3)}
.hdr-socials{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.hdr-soc{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--t2);font-size:10px;font-weight:500;text-decoration:none;transition:all .2s;white-space:nowrap}
.hdr-soc:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-dim);transform:translateY(-1px);box-shadow:0 2px 8px var(--gold-glow)}
.hdr-soc svg{width:12px;height:12px;flex-shrink:0}
.risk-badge{position:relative;width:64px;height:64px;flex-shrink:0}
.risk-badge svg{width:64px;height:64px;transform:rotate(-90deg)}
.risk-badge circle{fill:none;stroke-width:5;stroke-linecap:round;transition:stroke .3s}
.risk-badge .bg{stroke:var(--ring-bg)}
.risk-badge .val{filter:drop-shadow(0 0 6px var(--yellow))}
.risk-badge .val.low{stroke:var(--green);filter:drop-shadow(0 0 6px var(--green))}
.risk-badge .val.med{stroke:var(--yellow);filter:drop-shadow(0 0 6px var(--yellow))}
.risk-badge .val.high{stroke:var(--red);filter:drop-shadow(0 0 6px var(--red))}
.risk-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.risk-num b{font-size:22px;font-weight:800;line-height:1}
.risk-num small{font-size:8px;color:var(--t3);text-transform:uppercase;letter-spacing:1px;font-weight:600}
@keyframes ringDraw{from{stroke-dashoffset:176}to{stroke-dashoffset:var(--ring-target,109)}}
.risk-badge .val{animation:ringDraw .8s cubic-bezier(.4,0,.2,1) .3s both}
.verdict{display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:8px;margin-bottom:12px;font-size:12px;transition:background .3s,border-color .3s}
.verdict b{white-space:nowrap}
.verdict.low{background:var(--green-dim);border:1px solid rgba(0,230,167,0.12);color:var(--green)}
.verdict.med{background:var(--yellow-dim);border:1px solid rgba(255,176,32,0.12);color:var(--yellow)}
.verdict.high{background:var(--red-dim);border:1px solid rgba(255,77,106,0.12);color:var(--red)}
.strip{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;background:var(--border2);border-radius:10px;overflow:hidden;margin-bottom:12px;box-shadow:var(--card-shadow);transition:box-shadow .3s}
.st{background:var(--bg2);padding:12px 10px;text-align:center;transition:all .2s}
.st:hover{background:var(--bg3)}
.st-l{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;white-space:nowrap}
.st-v{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.st-s{font-size:10px;color:var(--t3);margin-top:2px}
.cd{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;box-shadow:var(--card-shadow);transition:all .25s}
.cd:hover{box-shadow:var(--card-shadow),0 4px 20px rgba(0,0,0,.1);transform:translateY(-1px)}
.cd-t{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--gold);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.cd-t::before{content:'';width:3px;height:14px;background:var(--gold);border-radius:1px}
.sec-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.sec{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border-radius:8px;transition:all .2s}
.sec:hover{background:var(--bg4)}
.sec-i{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.sec-i.p{background:var(--green-dim);color:var(--green)}
.sec-i.w{background:var(--yellow-dim);color:var(--yellow)}
.sec-i.f{background:var(--red-dim);color:var(--red)}
.sec-b{flex:1;min-width:0}
.sec-n{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec-d{font-size:10px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec-s{font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;flex-shrink:0}
.sec-s.p{background:var(--green-dim);color:var(--green)}
.sec-s.w{background:var(--yellow-dim);color:var(--yellow)}
.sec-s.f{background:var(--red-dim);color:var(--red)}
.hbar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:10px 0 6px;gap:2px}
.hbar div{border-radius:3px;transition:background .3s}
.hleg{display:flex;gap:14px;font-size:10px;color:var(--t3)}
.hleg b{color:var(--t2)}
.con-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.con{background:var(--bg3);padding:10px;border-radius:8px;text-align:center;transition:all .2s}
.con:hover{background:var(--bg4)}
.con-l{font-size:10px;color:var(--t3);margin-bottom:3px}
.con-v{font-size:12px;font-weight:600}
.con-v.g{color:var(--green)}.con-v.r{color:var(--red)}.con-v.y{color:var(--yellow)}
.feats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ft{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border-radius:8px;transition:all .2s}
.ft:hover{background:var(--bg4);transform:translateY(-1px)}
.ft-i{font-size:18px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--gold-dim);border-radius:8px;flex-shrink:0}
.ft-n{font-size:12px;font-weight:600;line-height:1.3}
.ft-d{font-size:10px;color:var(--t3);line-height:1.3}
.intel{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.itm{padding:14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border2);transition:all .2s}
.itm:hover{border-color:var(--border);transform:translateY(-1px)}
.itm-h{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.itm-dot{width:7px;height:7px;border-radius:50%}
.itm-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--t3)}
.itm-b{font-size:12px;color:var(--t2);line-height:1.6}
.itm-b strong{color:var(--t1)}
.ex-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.ex{background:var(--gold-dim);border:1px solid rgba(240,185,11,0.15);padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600;color:var(--gold2);transition:all .15s;text-decoration:none}
a.ex:hover{background:var(--gold);color:#000;border-color:var(--gold)}
.sent-bar{display:flex;height:5px;border-radius:3px;overflow:hidden;gap:1px;margin:8px 0 4px}
.sent-bar .pos{background:var(--green)}.sent-bar .neu{background:var(--t3)}.sent-bar .neg{background:var(--red)}
.sent-lbl{display:flex;justify-content:space-between;font-size:10px;color:var(--t3)}
.rcols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rcol h4{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border2);display:flex;align-items:center;gap:6px}
.rcol.warn h4{color:var(--yellow)}.rcol.ok h4{color:var(--green)}
.ri{display:flex;gap:8px;margin-bottom:7px;font-size:12px;color:var(--t2);line-height:1.5}
.ri::before{content:'';width:4px;height:4px;border-radius:50%;margin-top:7px;flex-shrink:0}
.rcol.warn .ri::before{background:var(--yellow)}.rcol.ok .ri::before{background:var(--green)}
.adv{margin-top:14px;padding:14px;background:linear-gradient(135deg,var(--gold-dim),transparent);border:1px solid rgba(240,185,11,0.12);border-radius:10px;transition:background .3s}
.adv-h{font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;display:flex;align-items:center;gap:6px}
.adv p{font-size:12px;color:var(--t2);line-height:1.7}
.adv strong{color:var(--t1)}
.bs{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 12px;background:var(--bg3);border-radius:8px;transition:background .3s}
.bs-bar{flex:1;display:flex;height:6px;border-radius:3px;overflow:hidden;gap:1px}
.bs-bar .b{background:var(--green)}.bs-bar .s{background:var(--red)}
.bs-l{font-size:10px;color:var(--t3);white-space:nowrap}
.ftr{text-align:center;padding:20px 0;margin-top:8px;border-top:1px solid var(--border)}
.ftr-b{font-size:12px;color:var(--t2);margin-bottom:4px}.ftr-b span{color:var(--gold);font-weight:700}
.ftr-s{font-size:10px;color:var(--t3)}
.ftr-d{font-size:10px;color:var(--t3);max-width:600px;margin:6px auto 0;line-height:1.5}
.custom-html{font-size:12px;color:var(--t2);line-height:1.7;word-break:break-word}
.cp{display:inline-flex;align-items:center;gap:4px;position:relative}
.cp:hover{color:var(--gold)}
.cp-btn{border:0;background:transparent;padding:0;display:inline-flex;align-items:center;color:inherit;cursor:pointer}
.cp-ico{opacity:.3;font-size:10px;transition:opacity .15s;line-height:1}
.cp:hover .cp-ico{opacity:.8}
.cp-tip{position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:var(--gold);color:#000;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s}
.cp.ok .cp-tip{opacity:1}
.addr{font-family:var(--mono);text-decoration:none;color:inherit;transition:color .15s}
.addr:hover{color:var(--gold)}
.src-link{color:var(--t3);text-decoration:none;border-bottom:1px dashed transparent;transition:all .15s}
.src-link:hover{color:var(--gold);border-bottom-color:var(--gold)}
@media(max-width:640px){
  .strip{grid-template-columns:repeat(3,1fr)}
  .sec-grid,.intel,.rcols,.feats{grid-template-columns:1fr}
  .con-row{grid-template-columns:repeat(2,1fr)}
  .hdr-top{flex-direction:column;text-align:center;gap:12px}
  .hdr-socials{justify-content:center}
  .ctrl{top:auto;bottom:12px;right:50%;transform:translateX(50%)}
}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.cd,.strip{animation:fadeIn .4s ease both}
.cd:nth-child(2){animation-delay:.03s}.cd:nth-child(3){animation-delay:.06s}.cd:nth-child(4){animation-delay:.09s}`;
}

function renderCopyable(fullAddr: string, displayAddr: string, link: string): string {
  return `<span class="cp"><a class="addr" href="${safeHref(link)}" target="_blank">${esc(displayAddr)}</a> <button class="cp-btn" type="button" data-copy="${escAttr(fullAddr)}" aria-label="Copy address"><span class="cp-ico">&#128203;</span></button><span class="cp-tip">Copied!</span></span>`;
}

function renderHeader(d: ReportJSON): string {
  const addr = d.token.address;
  const logo = d.token.logoLetter || d.token.symbol.charAt(0).toUpperCase();
  const rc = riskClass(d.riskLevel);
  const offset = ringOffset(d.riskScore);

  const socials = d.links.map(lk => {
    const icon = SOCIAL_ICONS[lk.type] || SOCIAL_ICONS.custom;
    return `<a class="hdr-soc" href="${safeHref(lk.url)}" target="_blank">${icon}${socialLabel(lk)}</a>`;
  }).join('\n      ');

  return `<div class="hdr">
    <div class="hdr-top">
      <div class="hdr-left">
        <div class="hdr-logo">${esc(logo)}</div>
        <div class="hdr-info">
          <h1>${esc(d.token.name)} <span>$${esc(d.token.symbol)}</span></h1>
          <div class="hdr-meta">
            <span class="hdr-chain">${esc(d.token.chain)}</span>
            <span class="hdr-addr">${renderCopyable(addr, abbr(addr), bscTokenUrl(addr))}</span>
            <span class="hdr-time">${esc(d.date)}</span>
          </div>
        </div>
      </div>
      <div class="risk-badge">
        <svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="val ${rc}" cx="32" cy="32" r="28" stroke-dasharray="176" stroke-dashoffset="${offset}" style="--ring-target:${offset}"/></svg>
        <div class="risk-num"><b style="color:${riskColor(d.riskLevel)}">${d.riskScore}</b><small>${bi({ zh: '风险', en: 'RISK' })}</small></div>
      </div>
    </div>
    <div class="hdr-socials">${socials}</div>
  </div>`;
}

function renderVerdict(d: ReportJSON): string {
  const rc = riskClass(d.riskLevel);
  const icon = d.riskLevel === 'low' ? '&#10004;&#65039;' : d.riskLevel === 'high' ? '&#10060;' : '&#9888;&#65039;';
  return `<div class="verdict ${rc}"><b>${icon}</b>${bi(d.verdict)}</div>`;
}

function renderStats(d: ReportJSON): string {
  const cells = d.stats.map(st => {
    let val: string;
    if (st.link) {
      val = `<a class="addr" href="${safeHref(st.link)}" target="_blank" style="font-family:inherit">${esc(st.value)}</a>`;
    } else {
      val = esc(st.value);
    }
    const changeClass = st.change?.startsWith('-') ? ' dn' : st.change?.startsWith('+') ? ' up' : '';
    const sub = st.sub ? `<div class="st-s${changeClass}">${typeof st.sub === 'string' ? esc(st.sub) : bi(st.sub)}</div>` : '';
    const changeDiv = st.change ? `<div class="st-s${changeClass}">${esc(st.change)}</div>` : '';
    return `<div class="st"><div class="st-l">${bi(st.label)}</div><div class="st-v">${val}</div>${changeDiv || sub}</div>`;
  }).join('\n    ');
  return `<div class="strip">${cells}</div>`;
}

function renderSecurityItem(item: SecurityItem): string {
  const sc = item.status === 'pass' ? 'p' : item.status === 'warn' ? 'w' : 'f';
  const icon = item.status === 'pass' ? '&#10003;' : item.status === 'warn' ? '!' : '&#10007;';
  const badge = item.status === 'pass' ? 'PASS' : item.status === 'warn' ? 'WARN' : 'FAIL';
  const detail = typeof item.detail === 'string' ? esc(item.detail) : bi(item.detail);
  const detailHtml = item.detailLink
    ? `<a class="src-link" href="${safeHref(item.detailLink)}" target="_blank">${detail}</a>`
    : detail;
  return `<div class="sec"><div class="sec-i ${sc}">${icon}</div><div class="sec-b"><div class="sec-n">${bi(item.name)}</div><div class="sec-d">${detailHtml}</div></div><span class="sec-s ${sc}">${badge}</span></div>`;
}

function renderHolders(h: HolderDistribution, tokenAddr: string): string {
  const segs = h.segments.map(s => {
    const color = s.color === 'gold' ? 'var(--gold)' : s.color === 'blue' ? 'var(--blue)' : 'var(--bar-dim)';
    return `<div style="width:${s.percent}%;background:${color}"></div>`;
  }).join('');
  const legends = h.segments.map(s => {
    const dotColor = s.color === 'gold' ? 'var(--gold)' : s.color === 'blue' ? 'var(--blue)' : 'var(--t3)';
    return `<span><b style="color:${dotColor}">&#9679;</b> ${bi(s.label)}</span>`;
  }).join('\n        ');
  const link = h.totalLink || bscHoldersUrl(tokenAddr);
  return `<div style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--t3)">${bi({ zh: '持仓分布', en: 'Holder Distribution' })}</span>
        <a class="src-link" href="${safeHref(link)}" target="_blank" style="font-size:11px">${bi({ zh: `${h.total.toLocaleString()} 持有人`, en: `${h.total.toLocaleString()} holders` })}</a>
      </div>
      <div class="hbar">${segs}</div>
      <div class="hleg">${legends}</div>
    </div>`;
}

function renderContract(c: ContractInfo, tokenAddr: string): string {
  const nameHtml = c.name
    ? (c.nameLink
      ? `<a class="src-link" href="${safeHref(c.nameLink)}" target="_blank" style="color:inherit">${esc(c.name)}</a>`
      : esc(c.name))
    : 'N/A';
  const nameClass = c.name ? ' y' : '';
  const creatorHtml = c.creator
    ? `<div class="con-v cp" style="font-size:10px;font-family:var(--mono)"><a class="addr" href="${safeHref(c.creatorLink || bscAddrUrl(c.creatorFull || c.creator))}" target="_blank">${esc(c.creator)}</a> <button class="cp-btn" type="button" data-copy="${escAttr(c.creatorFull || c.creator)}" aria-label="Copy creator"><span class="cp-ico">&#128203;</span></button><span class="cp-tip">Copied!</span></div>`
    : '<div class="con-v">N/A</div>';
  const licenseColor = c.licenseColor === 'green' ? ' g' : c.licenseColor === 'red' ? ' r' : c.licenseColor === 'yellow' ? ' y' : '';
  return `<div class="con-row">
      <div class="con"><div class="con-l">${bi({ zh: '合约名', en: 'Contract' })}</div><div class="con-v${nameClass}">${nameHtml}</div></div>
      <div class="con"><div class="con-l">${bi({ zh: '编译器', en: 'Compiler' })}</div><div class="con-v">${esc(c.compiler || 'N/A')}</div></div>
      <div class="con"><div class="con-l">${bi({ zh: '创建者', en: 'Creator' })}</div>${creatorHtml}</div>
      <div class="con"><div class="con-l">${bi({ zh: '许可证', en: 'License' })}</div><div class="con-v${licenseColor}">${esc(c.license || 'N/A')}</div></div>
    </div>`;
}

function renderBuySell(bs: BuySellData): string {
  const total = bs.buys + bs.sells || 1;
  const buyPct = Math.round((bs.buys / total) * 100);
  const sellPct = 100 - buyPct;
  return `<div class="bs">
      <div class="bs-l">${bi({ zh: '24h 买卖', en: '24h B/S' })}</div>
      <div class="bs-bar"><div class="b" style="width:${buyPct}%"></div><div class="s" style="width:${sellPct}%"></div></div>
      <div class="bs-l" style="color:var(--green)">${bi({ zh: `${bs.buys}买`, en: `${bs.buys}B` })}</div>
      <div class="bs-l">/</div>
      <div class="bs-l" style="color:var(--red)">${bi({ zh: `${bs.sells}卖`, en: `${bs.sells}S` })}</div>
    </div>`;
}

function renderSecurityCard(d: ReportJSON): string {
  const items = d.security.map(renderSecurityItem).join('\n      ');
  const holders = d.holders ? renderHolders(d.holders, d.token.address) : '';
  const contract = d.contract ? renderContract(d.contract, d.token.address) : '';
  const buySell = d.buySell ? renderBuySell(d.buySell) : '';
  return `<div class="cd">
    <div class="cd-t">${bi({ zh: '安全检查', en: 'Security Audit' })}</div>
    <div class="sec-grid">${items}</div>
    ${holders}${contract}${buySell}
  </div>`;
}

function renderOverview(d: ReportJSON): string {
  if (!d.overview) return '';
  const feats = d.overview.features.map(f =>
    `<div class="ft"><div class="ft-i">${esc(f.icon)}</div><div><div class="ft-n">${bi(f.name)}</div><div class="ft-d">${typeof f.detail === 'string' ? esc(f.detail) : bi(f.detail)}</div></div></div>`
  ).join('\n      ');
  return `<div class="cd">
    <div class="cd-t">${bi({ zh: '项目概况', en: 'Project Overview' })}</div>
    <p style="font-size:12px;color:var(--t2);line-height:1.7;margin-bottom:14px">${bi(d.overview.description)}</p>
    <div class="feats">${feats}</div>
  </div>`;
}

function renderIntelItem(item: IntelItem): string {
  const color = INTEL_COLORS[item.type] || INTEL_COLORS.custom;
  let extra = '';
  if (item.exchanges?.length) {
    extra = `<div class="ex-tags">${item.exchanges.map(ex =>
      `<a class="ex" href="${safeHref(ex.url)}" target="_blank">${esc(ex.name)}</a>`
    ).join('')}</div>`;
  }
  if (item.sentiment) {
    const s = item.sentiment;
    extra += `<div class="sent-bar"><div class="pos" style="width:${s.positive}%"></div><div class="neu" style="width:${s.neutral}%"></div><div class="neg" style="width:${s.negative}%"></div></div>
          <div class="sent-lbl"><span style="color:var(--green)">${bi({ zh: `正面 ${s.positive}%`, en: `Positive ${s.positive}%` })}</span><span>${bi({ zh: `中性 ${s.neutral}%`, en: `Neutral ${s.neutral}%` })}</span><span style="color:var(--red)">${bi({ zh: `负面 ${s.negative}%`, en: `Negative ${s.negative}%` })}</span></div>`;
  }
  return `<div class="itm">
        <div class="itm-h"><div class="itm-dot" style="background:${color}"></div><div class="itm-tag">${bi(item.label)}</div></div>
        <div class="itm-b">${bi(item.content)}${extra}</div>
      </div>`;
}

function renderIntel(d: ReportJSON): string {
  if (!d.intel.length) return '';
  const items = d.intel.map(renderIntelItem).join('\n      ');
  return `<div class="cd">
    <div class="cd-t">${bi({ zh: '网络情报', en: 'Web Intelligence' })}</div>
    <div class="intel">${items}</div>
  </div>`;
}

function renderRiskSummary(d: ReportJSON): string {
  const risks = d.risks.map(r => `<div class="ri">${bi(r)}</div>`).join('\n        ');
  const positives = d.positives.map(p => `<div class="ri">${bi(p)}</div>`).join('\n        ');
  return `<div class="cd">
    <div class="cd-t">${bi({ zh: '风险总结', en: 'Risk Summary' })}</div>
    <div class="rcols">
      <div class="rcol warn">
        <h4>&#9888;&#65039; ${bi({ zh: '风险因素', en: 'Risk Factors' })}</h4>
        ${risks}
      </div>
      <div class="rcol ok">
        <h4>&#10004;&#65039; ${bi({ zh: '积极信号', en: 'Positive Signals' })}</h4>
        ${positives}
      </div>
    </div>
    <div class="adv">
      <div class="adv-h">&#128161; ${bi({ zh: '操作建议', en: 'Recommendation' })}</div>
      <p>${bi(d.recommendation)}</p>
    </div>
  </div>`;
}

function renderCustomSections(sections: CustomSection[] | undefined, position: string): string {
  if (!sections) return '';
  return sections
    .filter(s => s.position === position)
    .map(s => `<div class="cd"><div class="cd-t">${bi(s.title)}</div><div class="custom-html">${esc(s.html).replace(/\n/g, '<br/>')}</div></div>`)
    .join('\n  ');
}

function renderFooter(): string {
  return `<div class="ftr">
    <div class="ftr-b">
      <span class="lang-zh">&#128737;&#65039; 由 <span>BNBrain</span> 生成</span>
      <span class="lang-en">&#128737;&#65039; Generated by <span>BNBrain</span></span>
    </div>
    <div class="ftr-s">
      <span class="lang-zh">
        数据来源：
        <a class="src-link" href="https://gopluslabs.io" target="_blank">GoPlus</a> ·
        <a class="src-link" href="https://bscscan.com" target="_blank">BscScan</a> ·
        <a class="src-link" href="https://dexscreener.com" target="_blank">DexScreener</a> ·
        <a class="src-link" href="https://serper.dev" target="_blank">Serper</a> · 官网抓取
      </span>
      <span class="lang-en">
        Sources:
        <a class="src-link" href="https://gopluslabs.io" target="_blank">GoPlus</a> ·
        <a class="src-link" href="https://bscscan.com" target="_blank">BscScan</a> ·
        <a class="src-link" href="https://dexscreener.com" target="_blank">DexScreener</a> ·
        <a class="src-link" href="https://serper.dev" target="_blank">Serper</a> · Direct Scraping
      </span>
    </div>
    <div class="ftr-d">${bi({ zh: '本报告由 AI 自动生成，仅供参考，不构成投资建议。加密货币投资存在高风险，请 DYOR。', en: 'AI-generated report for informational purposes only. Not financial advice. Crypto is risky. DYOR.' })}</div>
  </div>`;
}

// ── Main Entry ───────────────────────────────────────────

export function renderReport(data: ReportJSON): string {
  const rc = riskClass(data.riskLevel);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.token.symbol)} Deep Analysis | BNBrain</title>
<style>
${renderCSS()}
</style>
</head>
<body>
<div class="risk-bar ${rc}"></div>
<input type="checkbox" id="theme-toggle">
<input type="checkbox" id="lang-toggle">
<script src="/report-runtime.js" defer></script>
<div class="ctrl">
  <label for="theme-toggle" class="ctrl-theme"><span class="t-sun" title="Light">&#9788;</span><span class="t-moon" title="Dark">&#9790;</span></label>
  <div class="ctrl-sep"></div>
  <label for="lang-toggle" class="ctrl-lang"><span class="l-zh">中</span><span class="l-en">EN</span></label>
  <div class="ctrl-sep"></div>
  <button class="ctrl-btn" type="button" data-share-report title="Share"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></button>
</div>
<div class="page">
<div class="wrap">
  ${renderHeader(data)}
  ${renderVerdict(data)}
  ${renderStats(data)}
  ${renderSecurityCard(data)}
  ${renderCustomSections(data.customSections, 'after-security')}
  ${renderOverview(data)}
  ${renderCustomSections(data.customSections, 'after-overview')}
  ${renderIntel(data)}
  ${renderCustomSections(data.customSections, 'after-intel')}
  ${renderCustomSections(data.customSections, 'before-risk')}
  ${renderRiskSummary(data)}
  ${renderFooter()}
</div>
</div>
</body>
</html>`;
}
