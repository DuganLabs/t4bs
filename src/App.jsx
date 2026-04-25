import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./lib/api.js";
import { isPasskeySupported, registerPasskey, loginPasskey, devLogin } from "./lib/auth.js";
import { confetti } from "./lib/confetti.js";
import { buildShareCard, copyOrShare } from "./lib/share.js";
import { loadStats, recordResult, saveSession, loadSession, clearSession } from "./lib/persist.js";

/* ──────────────────────────────────────────────────────────────
   Server is authoritative for puzzle data, lives, score, locks.
   Client renders what the server returns; the answer never crosses
   the wire except in `reveal` after the round is finished.
   ──────────────────────────────────────────────────────────── */

const THEME = { tab:"#E8920A", tile:"#FFF3E0", letter:"#5C2A00", glow:"232,146,10" };

const openSlots = (wordLen, locked) => {
  const out = []; for (let i = 0; i < wordLen; i++) if (locked[i] === undefined) out.push(i); return out;
};
const fullCount = (words, locked) =>
  words.reduce((acc, n, wi) => acc + (n - Object.keys(locked[wi] || {}).length), 0);

const isDev = () => !!(import.meta && import.meta.env && import.meta.env.DEV);

/* ── CSS ─────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600&family=Caveat:wght@700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{background:#0C0B09;overscroll-behavior:none;-webkit-tap-highlight-color:transparent;}
html,body,#root{min-height:100dvh;}
body{font-family:'DM Sans',sans-serif;color:#F0EDE4;}
.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
:focus-visible{outline:2px solid #FFD700;outline-offset:2px;border-radius:4px;}

.lb{
  min-height:100dvh;
  background:radial-gradient(ellipse 110% 55% at 50% 0%,#1c1810 0%,#0C0B09 60%);
  display:flex;flex-direction:column;align-items:center;
  padding:max(env(safe-area-inset-top,0px),16px) 14px calc(96px + env(safe-area-inset-bottom,0px));
}

/* ── HEADER ── */
.lb-hd{position:sticky;top:0;z-index:30;width:100%;max-width:540px;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:6px 0;background:rgba(12,11,9,.78);backdrop-filter:blur(8px);}
.lb-logo{font-family:'Bebas Neue',sans-serif;font-size:23px;letter-spacing:4px;color:#F0EDE4;display:flex;align-items:center;gap:8px;cursor:pointer;}
.lb-logo-box{width:20px;height:20px;background:#E8920A;border-radius:3px;display:flex;align-items:center;justify-content:center;}
.lb-hd-r{display:flex;align-items:center;gap:8px;}

.lb-tok{font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;padding:3px 8px;border-radius:4px;border:1.5px solid #4EAF7C;color:#4EAF7C;display:flex;align-items:center;gap:4px;animation:tBump .5s cubic-bezier(.34,1.56,.64,1);box-shadow:0 0 10px rgba(78,175,124,.25);}
@keyframes tBump{0%{transform:scale(.55)}65%{transform:scale(1.18)}100%{transform:scale(1)}}

.lb-score{font-family:'Bebas Neue',sans-serif;font-size:19px;color:#F0EDE4;letter-spacing:1px;min-width:60px;text-align:right;}
.lb-snum{display:inline-block;animation:sPop .4s ease;}
@keyframes sPop{0%{transform:scale(1.5) translateY(-5px);color:#FFD700;}100%{transform:scale(1) translateY(0);color:#F0EDE4;}}

.lb-lives{display:flex;gap:5px;align-items:center;}
.lb-life{width:9px;height:9px;border-radius:50%;background:#E8920A;transition:all .3s;}
.lb-life.dead{background:#1E1C18;border:1px solid #2E2C28;transform:scale(.75);}

.lb-uctrl{display:flex;align-items:center;gap:6px;}
.lb-ubtn{
  background:transparent;border:1px solid #2E2C28;color:#9A9590;
  font-family:'Bebas Neue',sans-serif;font-size:12px;letter-spacing:1.5px;
  padding:7px 11px;border-radius:6px;cursor:pointer;min-height:34px;
  transition:all .15s;
}
.lb-ubtn:hover{border-color:#E8920A;color:#E8920A;}
.lb-ubtn.primary{background:#E8920A;color:#1A0A00;border-color:#E8920A;}
.lb-ubtn.primary:hover{background:#FFA830;}
.lb-uhandle{font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1.5px;color:#E8920A;padding:4px 8px;border:1px solid rgba(232,146,10,.4);border-radius:5px;}

/* ── META ── */
.lb-num{font-size:10px;text-transform:uppercase;letter-spacing:2.5px;color:#7A7570;margin-bottom:10px;width:100%;max-width:540px;text-align:center;}
.lb-sticky{background:#F5E06A;color:#1E1600;font-family:'Caveat',cursive;font-size:21px;font-weight:700;padding:10px 26px 12px;border-radius:2px;transform:rotate(-1.4deg);box-shadow:2px 4px 16px rgba(0,0,0,.55);margin-bottom:10px;text-align:center;line-height:1.2;max-width:320px;position:relative;}
.lb-sticky::after{content:'';position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:30px;height:15px;background:rgba(245,224,106,.4);border-radius:1px;}
.lb-sub{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9A9590;margin-bottom:18px;text-align:center;}
.lb-sub b{color:#E8920A;font-weight:600;}

.lb-hint{width:100%;max-width:540px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7A7570;margin-bottom:12px;min-height:14px;transition:color .4s;}
.lb-hint.on{color:#A06020;}

.lb-cbar{width:100%;max-width:540px;background:rgba(78,175,124,.08);border:1px solid rgba(78,175,124,.5);border-radius:8px;padding:10px 16px;margin-bottom:12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#4EAF7C;font-weight:600;animation:cBlink 1.2s ease infinite;}
@keyframes cBlink{0%,100%{opacity:1}50%{opacity:.55}}

/* ── PHRASE GRID ── */
.lb-phrase{
  width:100%;max-width:540px;
  display:flex;flex-wrap:wrap;justify-content:center;
  gap:14px 22px;margin-bottom:14px;padding:14px 6px;
  background:#161412;border:1.5px solid #222;border-radius:12px;
  position:relative;
}
.lb-word{display:flex;gap:4px;position:relative;cursor:pointer;}
.lb-word.active::before{content:'';position:absolute;left:-6px;right:-6px;top:-6px;bottom:-6px;border:1.5px solid var(--rc);border-radius:8px;box-shadow:0 0 18px rgba(var(--rg),.18);pointer-events:none;}
.lb-word.solved{cursor:default;}
.lb-word.casc-on::before{content:'';position:absolute;left:-6px;right:-6px;top:-6px;bottom:-6px;border:1.5px solid #4EAF7C;border-radius:8px;animation:cascGlow 1.1s ease infinite;pointer-events:none;}
@keyframes cascGlow{0%,100%{box-shadow:0 0 6px rgba(78,175,124,.2)}50%{box-shadow:0 0 22px rgba(78,175,124,.45)}}

.lb-word.shake{animation:shake .44s ease;}
@keyframes shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-7px)}35%{transform:translateX(7px)}55%{transform:translateX(-4px)}75%{transform:translateX(4px)}90%{transform:translateX(-2px)}}

/* ── TILES ── responsive sizing tuned for mobile */
.lb-tile{
  width:clamp(38px,9.5vw,46px);height:clamp(44px,11.5vw,52px);
  border-radius:5px;display:flex;align-items:center;justify-content:center;
  font-family:'Bebas Neue',sans-serif;font-size:clamp(22px,5.5vw,28px);
  user-select:none;flex-shrink:0;transform-origin:center center;
  transition:background .25s,border-color .2s;position:relative;
}
.lb-tile.anchor{box-shadow:0 2px 5px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.6);}
.lb-tile.locked-green{background:#4EAF7C;color:#0A1F12;box-shadow:0 2px 5px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.35);}
.lb-tile.solved-tile{background:#4EAF7C;color:#0A1F12;box-shadow:0 2px 5px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.4);}
.lb-tile.empty{background:#161412;border:1.5px solid #2A2724;color:#F0EDE4;}
.lb-tile.typed{background:#1E1C18;border:1.5px solid #555;color:#F0EDE4;animation:tPop .14s ease;cursor:pointer;}
@keyframes tPop{0%{transform:scale(.55)}60%{transform:scale(1.08)}100%{transform:scale(1)}}

.lb-tile.cursor{border:2px solid var(--rc);box-shadow:0 0 0 1px rgba(var(--rg),.5),0 0 12px rgba(var(--rg),.35);}
.lb-tile.cursor::after{content:'';position:absolute;width:2px;height:55%;background:var(--rc);animation:caret 1.05s steps(2) infinite;border-radius:1px;}
@keyframes caret{0%,49%{opacity:1}50%,100%{opacity:0}}

.lb-tile.fb-flip{animation:tFlip .55s ease;}
.lb-tile.fb-green {background:#4EAF7C!important;color:#0A1F12!important;border-color:#4EAF7C!important;}
.lb-tile.fb-yellow{background:#D4B445!important;color:#1F1700!important;border-color:#D4B445!important;}
.lb-tile.fb-absent{background:#2C2925!important;color:#5A5550!important;border-color:#2C2925!important;}
@keyframes tFlip{0%{transform:rotateX(0)}50%{transform:rotateX(-90deg)}100%{transform:rotateX(0)}}

.lb-tile.wagered{box-shadow:0 0 0 2px #FFD700,0 0 14px rgba(255,215,0,.55);}
.lb-tile.wagered::before{content:'2×';position:absolute;top:-8px;right:-8px;font-size:9px;letter-spacing:.5px;background:#FFD700;color:#1A0A00;padding:1px 4px;border-radius:3px;font-family:'Bebas Neue',sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.5);z-index:2;}

.lb-tile.casc-pick{cursor:pointer;}
.lb-tile.casc-pick:hover{transform:translateY(-3px) scale(1.08);filter:brightness(1.2);}
.lb-tile.casc-drop{animation:cDrop .55s cubic-bezier(.34,1.56,.64,1) forwards;}
@keyframes cDrop{0%{transform:scale(0);filter:brightness(3)}55%{transform:scale(1.18);filter:brightness(1.7)}100%{transform:scale(1);filter:brightness(1)}}

/* ── KNOWLEDGE BANK ── */
.lb-bank{width:100%;max-width:540px;display:flex;flex-direction:column;gap:6px;margin-bottom:12px;padding:8px 12px;background:#100F0D;border:1px solid #1F1C18;border-radius:8px;min-height:42px;}
.lb-bank-row{display:flex;flex-wrap:wrap;align-items:center;gap:5px;}
.lb-bank-label{font-size:9px;letter-spacing:1.3px;color:#9A9590;text-transform:uppercase;margin-right:4px;}
.lb-chip{font-family:'Bebas Neue',sans-serif;font-size:11px;letter-spacing:1px;padding:2px 7px 3px;border-radius:3px;animation:cIn .25s ease;}
.lb-chip.yellow{background:rgba(212,180,69,.16);color:#D4B445;border:1px solid rgba(212,180,69,.5);}
.lb-chip.absent{background:rgba(70,65,60,.35);color:#6A6560;border:1px solid #2C2925;text-decoration:line-through;}
@keyframes cIn{0%{opacity:0;transform:translateY(-3px) scale(.85)}100%{opacity:1;transform:translateY(0) scale(1)}}

/* ── ACTION BAR — sticky-bottom on mobile, with safe-area ── */
.lb-bar{
  position:fixed;left:0;right:0;
  bottom:0;
  z-index:30;
  background:linear-gradient(to top,#0C0B09 70%,rgba(12,11,9,0));
  padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px));
  display:flex;justify-content:center;
}
.lb-bar-inner{width:100%;max-width:540px;display:flex;align-items:center;gap:8px;}
.lb-prompt{flex:1;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#9A9590;}
.lb-allin{
  background:#1A1815;border:1px solid #FF4D4D;border-radius:8px;color:#FF4D4D;
  font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1.5px;
  padding:10px 14px;cursor:pointer;flex-shrink:0;min-height:44px;transition:all .15s;
}
.lb-allin:hover{background:#FF4D4D;color:#1A0A0A;box-shadow:0 0 18px rgba(255,77,77,.45);}
.lb-allin:active{transform:scale(.94);}
.lb-igo{
  background:var(--rc,#E8920A);border:none;border-radius:8px;color:#111;
  font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;
  padding:10px 24px;cursor:pointer;flex-shrink:0;min-height:44px;
  transition:filter .15s,transform .1s,opacity .2s;
}
.lb-igo:hover{filter:brightness(1.14);}
.lb-igo:active{transform:scale(.93);}
.lb-igo:disabled{opacity:.35;cursor:not-allowed;}

.lb-hidden{position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;border:none;background:transparent;color:transparent;font-size:16px;caret-color:transparent;padding:0;}

/* ── TOAST ── */
.lb-toast{
  position:fixed;top:calc(72px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);
  border-radius:100px;padding:8px 24px;
  font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;
  z-index:90;white-space:nowrap;pointer-events:none;
  animation:tIn2 .16s ease,tOut2 .28s ease 1.58s forwards;
}
@keyframes tIn2{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes tOut2{to{opacity:0;transform:translateX(-50%) translateY(-12px)}}
.lb-toast.good   {background:#1E1C16;color:#E8920A;border:1px solid rgba(232,146,10,.4);}
.lb-toast.bad    {background:#1E1518;color:#E84444;border:1px solid rgba(232,68,68,.4);}
.lb-toast.great  {background:#1E1C10;color:#FFD700;border:1px solid rgba(255,215,0,.5);box-shadow:0 0 28px rgba(255,215,0,.2);}
.lb-toast.cascade{background:#121E17;color:#4EAF7C;border:1px solid rgba(78,175,124,.5);}

/* ── OVERLAYS ── */
.lb-ov{position:fixed;inset:0;background:rgba(10,9,7,.92);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:100;animation:fadeIn .3s ease;padding:16px;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.lb-card{background:#1C1916;border:1px solid #2C2926;border-radius:14px;padding:24px 22px;width:min(420px,96vw);text-align:center;box-shadow:0 28px 72px rgba(0,0,0,.7);animation:cardIn .4s cubic-bezier(.34,1.56,.64,1);max-height:92vh;overflow:auto;}
@keyframes cardIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
.lb-ct{font-family:'Bebas Neue',sans-serif;font-size:38px;letter-spacing:4px;line-height:1;margin-bottom:2px;}
.lb-cs{font-size:13px;color:#9A9590;margin-bottom:18px;}
.lb-cf{font-family:'Bebas Neue',sans-serif;font-size:64px;color:#F0EDE4;line-height:1;margin-bottom:2px;}
.lb-cfl{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#9A9590;margin-bottom:14px;}

.lb-reveal{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:3px;color:#E8920A;margin-bottom:6px;line-height:1.2;}
.lb-cred{font-size:11px;text-transform:uppercase;letter-spacing:1.8px;color:#9A9590;margin-bottom:18px;}
.lb-cred b{color:#7EC49A;}

.lb-btn{display:block;width:100%;padding:13px;border-radius:8px;border:none;font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:2px;cursor:pointer;transition:all .15s;margin-bottom:9px;min-height:44px;}
.lb-btn:last-child{margin-bottom:0;}
.lb-bp{background:#E8920A;color:#1A0A00;}
.lb-bp:hover{background:#FFA830;}
.lb-bs{background:#1C1916;color:#F0EDE4;border:1px solid #2C2926;}
.lb-bs:hover{background:#242018;}

/* ── ALL-IN MODAL ── */
.lb-allin-grid{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 14px;margin:18px 0 22px;}
.lb-allin-input{
  background:#0F0E0C;border:1.5px solid #3A3530;border-radius:5px;
  font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:6px;
  color:#F0EDE4;text-align:center;padding:8px 4px 8px 10px;
  text-transform:uppercase;outline:none;min-height:44px;
}
.lb-allin-input:focus{border-color:#FF4D4D;box-shadow:0 0 14px rgba(255,77,77,.3);}
.lb-allin-warn{font-size:11px;color:#FF6E6E;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:14px;font-weight:600;}

/* ── LOBBY ── */
.lb-lobby{width:100%;max-width:480px;display:flex;flex-direction:column;gap:8px;margin-top:6px;list-style:none;padding:0;}
.lb-lobby > li{list-style:none;}
.lb-lobby-item{
  width:100%;background:#161412;border:1.5px solid #222;border-radius:10px;
  padding:14px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;
  gap:10px;transition:border-color .2s,transform .1s,background .15s;min-height:56px;text-align:left;
  font-family:'DM Sans',sans-serif;color:inherit;
}
.lb-lobby-item:hover{border-color:#E8920A;transform:translateY(-1px);background:#1A1714;}
.lb-lobby-item:active{transform:scale(.985);}
.lb-lobby-cat{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb-lobby-by{flex:0 0 auto;white-space:nowrap;}
.lb-lobby-cat{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2.5px;color:#F0EDE4;}
.lb-lobby-by{font-size:10px;letter-spacing:1.2px;color:#9A9590;text-transform:uppercase;}

.lb-tagline{font-size:11px;color:#9A9590;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:18px;text-align:center;}

.lb-stats{display:flex;gap:8px;justify-content:center;margin-bottom:18px;width:100%;max-width:320px;}
.lb-stat{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;background:#100F0D;border:1px solid #1F1C18;border-radius:8px;}
.lb-stat b{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1.5px;color:#F0EDE4;font-weight:400;}
.lb-stat span{font-size:9px;letter-spacing:1.2px;color:#9A9590;text-transform:uppercase;}

.lb-lobby-skel{width:100%;min-height:56px;border-radius:10px;background:linear-gradient(90deg,#161412 0%,#1E1C18 50%,#161412 100%);background-size:200% 100%;animation:skel 1.4s ease-in-out infinite;}
@keyframes skel{0%{background-position:200% 0}100%{background-position:-200% 0}}
.lb-fab{
  position:fixed;right:16px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:50;
  background:#E8920A;color:#1A0A00;border:none;border-radius:100px;
  font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1.5px;
  padding:14px 22px;cursor:pointer;box-shadow:0 8px 24px rgba(232,146,10,.4);
  min-height:48px;
  transition:transform .1s,box-shadow .15s;
}
.lb-fab:active{transform:scale(.95);}
.lb-fab:hover{box-shadow:0 8px 32px rgba(232,146,10,.6);}

/* ── FORMS (submit + login) ── */
.lb-form{display:flex;flex-direction:column;gap:12px;margin-bottom:16px;text-align:left;}
.lb-field{display:flex;flex-direction:column;gap:5px;}
.lb-flabel{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#9A9590;}
.lb-finput{
  background:#0F0E0C;border:1.5px solid #2A2724;border-radius:6px;
  color:#F0EDE4;font-family:'DM Sans',sans-serif;font-size:15px;
  padding:11px 12px;outline:none;min-height:44px;width:100%;
  transition:border-color .15s;
}
.lb-finput:focus{border-color:#E8920A;}
.lb-fhint{font-size:10px;color:#A09B95;letter-spacing:.5px;}
.lb-ferror{font-size:11px;color:#FF6E6E;letter-spacing:.5px;background:rgba(255,77,77,.08);padding:8px 10px;border-radius:5px;border:1px solid rgba(255,77,77,.3);}

/* ── PHRASE PREVIEW (in submit / moderate) ── */
.lb-preview{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 16px;margin:12px 0;padding:14px 8px;background:#100F0D;border-radius:8px;border:1px solid #1F1C18;}
.lb-pword{display:flex;gap:3px;}
.lb-ptile{
  width:30px;height:34px;border-radius:4px;display:flex;align-items:center;justify-content:center;
  font-family:'Bebas Neue',sans-serif;font-size:18px;
  background:#1E1C18;border:1px solid #2A2724;color:#F0EDE4;cursor:pointer;
  transition:all .12s;
}
.lb-ptile.anchor{background:#FFF3E0;color:#5C2A00;border-color:#E8920A;}
.lb-ptile:hover{transform:translateY(-1px);}

/* ── MODERATION QUEUE ── */
.lb-mod-list{width:100%;max-width:540px;display:flex;flex-direction:column;gap:12px;}
.lb-mod-item{
  background:#161412;border:1.5px solid #222;border-radius:10px;
  padding:14px;display:flex;flex-direction:column;gap:8px;
}
.lb-mod-meta{display:flex;justify-content:space-between;align-items:baseline;}
.lb-mod-cat{font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:2px;color:#F0EDE4;}
.lb-mod-by{font-size:10px;letter-spacing:1.2px;color:#9A9590;text-transform:uppercase;}
.lb-mod-phrase{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;color:#E8920A;line-height:1.2;word-break:break-word;}
.lb-mod-actions{display:flex;gap:8px;}
.lb-mod-btn{flex:1;padding:10px;border:none;border-radius:6px;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1.5px;cursor:pointer;min-height:42px;}
.lb-mod-btn.ok{background:#4EAF7C;color:#0A1F12;}
.lb-mod-btn.no{background:#2C2925;color:#FF6E6E;border:1px solid rgba(255,77,77,.3);}

/* ── TABS (auth modal segmented control) ── */
.lb-tabs{display:flex;gap:6px;margin-bottom:16px;background:#100F0D;padding:4px;border-radius:8px;}
.lb-tabs button{
  flex:1;background:transparent;border:none;color:#6A6560;
  font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:1.5px;
  padding:10px;border-radius:6px;cursor:pointer;min-height:40px;
}
.lb-tabs button.on{background:#1C1916;color:#F0EDE4;box-shadow:0 1px 3px rgba(0,0,0,.4);}

@media (max-width: 380px) {
  .lb-tile{width:34px;height:40px;font-size:20px;}
  .lb-bar-inner{gap:6px;}
  .lb-allin{padding:8px 10px;font-size:12px;}
  .lb-igo{padding:9px 18px;font-size:15px;}
  .lb-logo{font-size:20px;letter-spacing:3px;}
  .lb-score{font-size:17px;min-width:50px;}
}
`;

/* ─── COMPONENT ─────────────────────────────────────────────── */
export default function Tabs() {
  // App-level: view + auth + lobby
  const [view,    setView]    = useState("lobby");   // lobby | playing | submit | moderate
  const [user,    setUser]    = useState(null);      // { handle, isAdmin } | null
  const [authOpen,setAuthOpen]= useState(false);
  const [lobby,   setLobby]   = useState(null);
  const [error,   setError]   = useState(null);

  // Game session
  const [session,        setSession]       = useState(null);
  const [locked,         setLocked]        = useState([]);
  const [presentGlobal,  setPresentGlobal] = useState([]);
  const [absentByWord,   setAbsentByWord]  = useState([]);
  const [wordSolved,     setWordSolved]    = useState([]);
  const [score,          setScore]         = useState(0);
  const [lives,          setLives]         = useState(4);
  const [tokens,         setTokens]        = useState(0);
  const [phase,          setPhase]         = useState("lobby");
  const [reveal,         setReveal]        = useState(null);

  // Local UI
  const [active,    setActive]    = useState(null);
  const [typed,     setTyped]     = useState([]);
  const [wagers,    setWagers]    = useState([]);
  const [feedback,  setFeedback]  = useState({});
  const [shaking,   setShaking]   = useState(null);
  const [toast,     setToast]     = useState(null);
  const [casc,      setCasc]      = useState(false);
  const [cascDrop,  setCascDrop]  = useState(null);
  const [allInOpen, setAllInOpen] = useState(false);
  const [allInWords,setAllInWords]= useState([]);
  const [stats,    setStats]    = useState(() => loadStats());
  const [shareLbl, setShareLbl] = useState(null);
  const [resultRecorded, setResultRecorded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const iRefs = useRef([]);
  const tRef  = useRef(null);

  /* ── lobby + me + resume ── */
  useEffect(() => {
    api.listPuzzles().then(setLobby).catch(e => setError(String(e.message || e)));
    api.me().then(r => setUser(r.user)).catch(() => {});

    // Resume any in-flight session (server is authoritative)
    const saved = loadSession();
    if (saved?.sessionId) {
      api.resumeSession(saved.sessionId).then(s => {
        if (s.error || s.finished) { clearSession(); return; }
        const lm = s.words.map(() => ({}));
        s.anchors.forEach(a => { lm[a.wi][a.li] = a.letter; });
        // overlay greens locked from prior guesses
        Object.entries(s.locked || {}).forEach(([wi, m]) => {
          Object.entries(m || {}).forEach(([li, letter]) => { lm[Number(wi)][Number(li)] = letter; });
        });
        setSession(s);
        setLocked(lm);
        setPresentGlobal(s.presentGlobal || []);
        setAbsentByWord(s.absentByWord || s.words.map(() => []));
        setWordSolved(s.wordSolved || s.words.map(() => false));
        setScore(s.score || 0);
        setLives(s.lives);
        setTokens(s.tokens || 0);
        setReveal(null);
        setTyped(s.words.map(() => []));
        setWagers(s.words.map(() => []));
        setFeedback({});
        setActive(null);
        setCasc(false);
        setPhase("playing");
        setView("playing");
        toast$("RESUMED — pick up where you left off", "good");
      }).catch(() => clearSession());
    }
  }, []);

  /* ── start a session ── */
  const start = useCallback(async (puzzleId) => {
    setError(null);
    try {
      const s = await api.startSession(puzzleId);
      setSession(s);
      const lm = s.words.map(() => ({}));
      s.anchors.forEach(a => { lm[a.wi][a.li] = a.letter; });
      setLocked(lm);
      setPresentGlobal([]);
      setAbsentByWord(s.words.map(() => []));
      setWordSolved(s.words.map(() => false));
      setScore(0);
      setLives(s.lives);
      setTokens(0);
      setReveal(null);
      setTyped(s.words.map(() => []));
      setWagers(s.words.map(() => []));
      setFeedback({});
      setActive(null);
      setCasc(false);
      setCascDrop(null);
      setPhase("playing");
      setView("playing");
      saveSession({ sessionId: s.sessionId });
    } catch (e) {
      setError(String(e.message || e));
    }
  }, []);

  /* ── auto-pick first unsolved word ── */
  useEffect(() => {
    if (phase !== "playing" || casc || allInOpen) return;
    if (active === null || wordSolved[active]) {
      const next = wordSolved.findIndex(s => !s);
      if (next !== -1) setActive(next);
    }
  }, [wordSolved, casc, phase, allInOpen]);

  useEffect(() => {
    if (active !== null) setTimeout(() => iRefs.current[active]?.focus(), 30);
  }, [active]);

  /* ── persist + confetti when round ends ── */
  useEffect(() => {
    if (resultRecorded) return;
    if (phase === "won" || phase === "lost") {
      const next = recordResult({ won: phase === "won", score, category: session?.category });
      setStats(next);
      setResultRecorded(true);
      clearSession();
      if (phase === "won") confetti();
      if (navigator.vibrate) navigator.vibrate(phase === "won" ? [40, 40, 80] : 200);
    }
  }, [phase, score, session, resultRecorded]);

  /* reset record-flag when starting a new session */
  useEffect(() => { setResultRecorded(false); setShareLbl(null); }, [session?.sessionId]);

  const toast$ = useCallback((text, type = "good") => {
    clearTimeout(tRef.current);
    setToast(null);
    requestAnimationFrame(() => {
      setToast({ text, type, id: Date.now() });
      tRef.current = setTimeout(() => setToast(null), 1950);
    });
  }, []);

  /* ── typing handler (smart-skip locked positions) ── */
  const onInputChange = (wi) => (e) => {
    if (phase !== "playing" || casc || allInOpen || wordSolved[wi]) return;
    const wordLen = session.words[wi];
    const lm = locked[wi];
    const v  = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
    const slots = openSlots(wordLen, lm);
    const result = [];
    let ti = 0;
    for (let pos = 0; pos < wordLen && result.length < slots.length; pos++) {
      if (lm[pos] !== undefined) {
        if (ti < v.length && v[ti] === lm[pos]) ti++;
      } else if (ti < v.length) {
        result.push(v[ti]); ti++;
      }
    }
    setTyped(prev => prev.map((t, i) => i !== wi ? t : result));
    setWagers(prev => prev.map((w, i) => i !== wi ? w : w.filter(slotIdx => slotIdx < result.length)));
  };

  const onInputKey = (wi) => (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(wi); }
    else if (e.key === "Escape") { e.preventDefault(); setActive(null); }
  };

  const toggleWager = (wi, slotIdx) => {
    if (phase !== "playing" || casc || wi !== active) return;
    if (slotIdx >= typed[wi].length) return;
    setWagers(prev => prev.map((w, i) => {
      if (i !== wi) return w;
      return w.includes(slotIdx) ? w.filter(s => s !== slotIdx) : [...w, slotIdx];
    }));
  };

  /* ── submit ── */
  const submit = useCallback(async (wi) => {
    if (phase !== "playing" || casc || allInOpen || wordSolved[wi]) return;
    const wordLen = session.words[wi];
    const lm = locked[wi];
    const slots = openSlots(wordLen, lm);
    if (typed[wi].length < slots.length) {
      setShaking(wi); setTimeout(() => setShaking(null), 480);
      return;
    }
    try {
      const result = await api.guess(session.sessionId, wi, typed[wi], wagers[wi]);
      const fullGuess = [];
      for (let i = 0; i < wordLen; i++) {
        if (lm[i] !== undefined) fullGuess.push(lm[i]);
        else fullGuess.push(typed[wi][slots.indexOf(i)]);
      }
      const fb = result.feedback.map((status, idx) => ({ idx, letter: fullGuess[idx], status }));
      setFeedback(prev => ({ ...prev, [wi]: fb }));
      setLocked(prev => prev.map((m, i) => i !== wi ? m : { ...result.locked }));
      setPresentGlobal(result.presentGlobal);
      setAbsentByWord(prev => prev.map((s, i) => i !== wi ? s : result.absentByWord));
      setScore(result.score);
      setLives(result.lives);
      setTokens(result.tokens);
      setTyped(prev => prev.map((t, i) => i !== wi ? t : []));
      setWagers(prev => prev.map((w, i) => i !== wi ? w : []));

      const won = result.feedback.every(s => s === "green");
      if (won) {
        setWordSolved(prev => prev.map((v, i) => i !== wi ? v : true));
        setActive(null);
        const wagerCount = wagers[wi].length;
        const wagerNote = wagerCount > 0 ? ` · ${wagerCount}× STAKE WON` : "";
        toast$(`+${result.scoreDelta}pts${wagerNote}`, "great");
        if (result.cascadeEarned) setTimeout(() => setCasc(true), 600);
      } else {
        setShaking(wi); setTimeout(() => setShaking(null), 480);
        const lossNote = wagers[wi].length > 0 ? " · STAKE LOST" : "";
        toast$(`${result.scoreDelta}pts${lossNote}`, "bad");
      }
      setTimeout(() => {
        setFeedback(prev => { const n = { ...prev }; delete n[wi]; return n; });
        if (result.finished) { setPhase(result.finished); setReveal(result.reveal); }
      }, 1100);
    } catch (e) {
      toast$(`error: ${String(e.message || e)}`, "bad");
    }
  }, [session, locked, typed, wagers, phase, casc, allInOpen, wordSolved, toast$]);

  const pickCascade = async (wi, li) => {
    if (!casc || tokens <= 0 || wordSolved[wi]) return;
    if (locked[wi][li] !== undefined) return;
    try {
      const result = await api.cascade(session.sessionId, wi, li);
      setLocked(prev => prev.map((m, i) => i !== wi ? m : { ...result.locked }));
      setTokens(result.tokens);
      setPresentGlobal(result.presentGlobal);
      setCascDrop(`${wi}-${li}`);
      setTimeout(() => setCascDrop(null), 600);
      setCasc(false);
      setActive(wi);
      toast$("⚡ FREE LETTER", "cascade");
    } catch (e) {
      toast$(`error: ${String(e.message || e)}`, "bad");
    }
  };

  const openAllIn = () => {
    setAllInWords(session.words.map(() => ""));
    setAllInOpen(true);
  };
  const submitAllIn = async () => {
    if (!session) return;
    const guesses = allInWords.map((s, wi) => (s || "").toUpperCase().slice(0, session.words[wi]));
    if (guesses.some((g, i) => g.length !== session.words[i])) {
      toast$("FILL ALL WORDS", "bad");
      return;
    }
    try {
      const result = await api.allIn(session.sessionId, guesses);
      setAllInOpen(false);
      setScore(result.score);
      setLives(result.lives);
      if (result.correct) {
        setWordSolved(session.words.map(() => true));
        setLocked(session.words.map((len, wi) => {
          const m = {};
          for (let i = 0; i < len; i++) m[i] = result.reveal[wi][i];
          return m;
        }));
        toast$(`ALL-IN CORRECT  +${result.scoreDelta}pts`, "great");
      } else {
        toast$("ALL-IN BUSTED — GAME OVER", "bad");
      }
      setTimeout(() => {
        if (result.finished) { setPhase(result.finished); setReveal(result.reveal); }
      }, 900);
    } catch (e) {
      toast$(`error: ${String(e.message || e)}`, "bad");
    }
  };

  const refreshLobby = () => api.listPuzzles().then(setLobby).catch(()=>{});
  const goLobby = () => { setView("lobby"); setPhase("lobby"); };

  const onLogout = async () => { await api.logout(); setUser(null); };

  /* ── derived ── */
  const hintText = (() => {
    if (casc) return "⚡ tap any unrevealed tile to reveal";
    if (phase !== "playing") return "";
    if (active === null) return "";
    const slots = openSlots(session.words[active], locked[active]);
    const room = slots.length - typed[active].length;
    if (room === 0) return "press enter or tap go · tap a tile to stake 2×";
    return `type ${room} letter${room === 1 ? "" : "s"} for word ${active + 1}`;
  })();

  /* ─── HEADER ─── */
  const Header = () => (
    <header className="lb-hd">
      <div className="lb-logo" onClick={goLobby}>
        <div className="lb-logo-box">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="6" r="3.5" fill="#1A0A00"/>
            <rect x="5.5" y="10" width="3" height="2" rx=".5" fill="#1A0A00"/>
          </svg>
        </div>
        T4BS
      </div>
      <div className="lb-hd-r">
        {view === "playing" && (
          <>
            {tokens > 0 && <div key={tokens} className="lb-tok">⚡ {tokens}</div>}
            <div className="lb-score"><span key={score} className="lb-snum">{score}</span> pts</div>
            <div className="lb-lives">
              {[0,1,2,3].map(i => <div key={i} className={`lb-life${i >= lives ? " dead" : ""}`}/>)}
            </div>
          </>
        )}
        {view !== "playing" && (
          <div className="lb-uctrl">
            <button className="lb-ubtn" onClick={()=>setHelpOpen(true)} aria-label="How to play">?</button>
            {user
              ? <>
                  <span className="lb-uhandle">{user.handle}</span>
                  {user.isAdmin && <button className="lb-ubtn" onClick={()=>setView("moderate")}>MOD</button>}
                  <button className="lb-ubtn" onClick={onLogout}>OUT</button>
                </>
              : <button className="lb-ubtn primary" onClick={()=>setAuthOpen(true)}>LOG IN</button>}
          </div>
        )}
      </div>
    </header>
  );

  /* ─── LOBBY ─── */
  if (view === "lobby") {
    return (
      <>
        <style>{CSS}</style>
        <div className="lb">
          <Header />
          <main aria-labelledby="lb-page-title">
            <h1 id="lb-page-title" className="sr-only">T4BS — pick a round</h1>
            <div className="lb-sticky" style={{maxWidth:380}}>One subject. One phrase.<br/>No mercy.</div>
            <div className="lb-tagline">Pick a round</div>
            {(stats.played > 0) && (
              <div className="lb-stats" aria-label="Personal stats">
                <span className="lb-stat"><b>{stats.wins||0}</b><span>WINS</span></span>
                <span className="lb-stat"><b>{stats.best||0}</b><span>BEST</span></span>
                <span className="lb-stat"><b>{stats.streak>0?`🔥${stats.streak}`:"—"}</b><span>STREAK</span></span>
              </div>
            )}
            {error && <div className="lb-cred" style={{color:"#FF6E6E"}} role="alert">error: {error}</div>}
            <ul className="lb-lobby" aria-label="Available puzzles">
              {lobby
                ? lobby.map(p => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="lb-lobby-item"
                        onClick={() => start(p.id)}
                        aria-label={`Play ${p.category}, submitted by ${p.submittedBy}`}
                      >
                        <span className="lb-lobby-cat">{p.category}</span>
                        <span className="lb-lobby-by">by {p.submittedBy}</span>
                      </button>
                    </li>
                  ))
                : Array.from({length: 6}).map((_, i) => (
                    <li key={i}><div className="lb-lobby-skel" aria-hidden="true"/></li>
                  ))}
            </ul>
          </main>
          <button className="lb-fab" onClick={() => user ? setView("submit") : setAuthOpen(true)} aria-label="Submit a new phrase">
            + SUBMIT A PHRASE
          </button>
          {authOpen && <AuthModal onClose={()=>setAuthOpen(false)} onAuthed={(u)=>{setUser(u);setAuthOpen(false);}} />}
          {helpOpen && <HelpModal onClose={()=>setHelpOpen(false)} />}
        </div>
      </>
    );
  }

  /* ─── SUBMIT ─── */
  if (view === "submit") {
    return (
      <>
        <style>{CSS}</style>
        <div className="lb">
          <Header />
          <main aria-labelledby="lb-page-title">
            <h1 id="lb-page-title" className="sr-only">Submit a phrase</h1>
            <div className="lb-sticky" style={{maxWidth:380}}>Submit a phrase</div>
            <div className="lb-tagline">It enters the moderation queue</div>
            <SubmitForm
              onCancel={goLobby}
              onSubmitted={() => { toast$("SUBMITTED — pending review", "great"); goLobby(); }}
              toast$={toast$}
            />
          </main>
          {toast && <div key={toast.id} className={`lb-toast ${toast.type}`} role="status" aria-live="polite">{toast.text}</div>}
          {helpOpen && <HelpModal onClose={()=>setHelpOpen(false)} />}
        </div>
      </>
    );
  }

  /* ─── MODERATE ─── */
  if (view === "moderate") {
    return (
      <>
        <style>{CSS}</style>
        <div className="lb">
          <Header />
          <main aria-labelledby="lb-page-title">
            <h1 id="lb-page-title" className="sr-only">Moderation queue</h1>
            <div className="lb-sticky" style={{maxWidth:380}}>Moderation queue</div>
            <div className="lb-tagline">Approve or reject pending phrases</div>
            <ModerateList toast$={toast$} onChange={refreshLobby} />
            <button className="lb-btn lb-bs" style={{maxWidth:300,marginTop:14}} onClick={goLobby}>← Back</button>
          </main>
          {toast && <div key={toast.id} className={`lb-toast ${toast.type}`} role="status" aria-live="polite">{toast.text}</div>}
          {helpOpen && <HelpModal onClose={()=>setHelpOpen(false)} />}
        </div>
      </>
    );
  }

  /* ─── PLAYING ─── */
  return (
    <>
      <style>{CSS}</style>
      <div className="lb" style={{ "--rc": THEME.tab, "--rg": THEME.glow }}>
        <Header />
        <main aria-labelledby="lb-page-title">
          <h1 id="lb-page-title" className="sr-only">{session.category} — round #{session.id}</h1>
          <div className="lb-num">#{session.id} · {session.category.toLowerCase()}</div>
          <div className="lb-sticky">{session.category}</div>
          <div className="lb-sub">{session.words.length} words · {session.totalLetters} letters · by <b>{session.submittedBy}</b></div>
          <div className={`lb-hint ${active !== null ? "on" : ""}`} aria-live="polite">{hintText}</div>

        {casc && <div className="lb-cbar">⚡ Earned reveal — pick any tile in any unsolved word</div>}

        <div className="lb-phrase">
          {session.words.map((wordLen, wi) => {
            const lm     = locked[wi];
            const slots  = openSlots(wordLen, lm);
            const isAct  = active === wi && !wordSolved[wi] && !casc && !allInOpen;
            const cascOn = casc && !wordSolved[wi];
            const fbW    = feedback[wi];
            const wagerSet = new Set(wagers[wi]);

            return (
              <div
                key={wi}
                className={[
                  "lb-word",
                  isAct           ? "active"  : "",
                  wordSolved[wi]  ? "solved"  : "",
                  shaking === wi  ? "shake"   : "",
                  cascOn          ? "casc-on" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => {
                  if (casc) return;
                  if (!wordSolved[wi]) setActive(wi);
                }}
              >
                {!wordSolved[wi] && (
                  <input
                    ref={el => iRefs.current[wi] = el}
                    className="lb-hidden"
                    type="text"
                    autoComplete="off" autoCorrect="off" spellCheck={false}
                    autoCapitalize="characters"
                    inputMode="text"
                    value={typed[wi]?.join("") || ""}
                    onChange={onInputChange(wi)}
                    onKeyDown={onInputKey(wi)}
                    onClick={e => e.stopPropagation()}
                    aria-label={`Word ${wi + 1}`}
                  />
                )}
                {Array.from({length: wordLen}).map((_, li) => {
                  const lockedLetter = lm[li];
                  const isAnchor = session.anchors.some(a => a.wi === wi && a.li === li);
                  const slotIdx  = slots.indexOf(li);
                  const typedLetter = slotIdx >= 0 ? typed[wi][slotIdx] : null;
                  const isCursor = isAct && slotIdx === typed[wi].length;
                  const fbForTile = fbW?.find(f => f.idx === li);
                  const isCascDrop = cascDrop === `${wi}-${li}`;
                  const isCascPick = casc && lockedLetter === undefined && !wordSolved[wi];
                  const isWagered  = slotIdx >= 0 && wagerSet.has(slotIdx) && typedLetter;

                  const cls = ["lb-tile"];
                  let display = null;

                  if (wordSolved[wi]) { cls.push("solved-tile"); display = lockedLetter; }
                  else if (lockedLetter !== undefined) {
                    display = lockedLetter;
                    if (isAnchor) cls.push("anchor");
                    else cls.push("locked-green");
                  }
                  else if (typedLetter) { cls.push("typed"); display = typedLetter; }
                  else { cls.push("empty"); if (isCursor) cls.push("cursor"); }

                  if (fbForTile) { cls.push("fb-flip", `fb-${fbForTile.status}`); display = fbForTile.letter; }
                  if (isWagered) cls.push("wagered");
                  if (isCascPick) cls.push("casc-pick");
                  if (isCascDrop) cls.push("casc-drop");

                  const style = (lockedLetter !== undefined && isAnchor && !wordSolved[wi] && !fbForTile)
                    ? { background: THEME.tile, color: THEME.letter } : {};

                  return (
                    <div
                      key={li}
                      className={cls.join(" ")}
                      style={style}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCascPick) { pickCascade(wi, li); return; }
                        if (isAct && typedLetter) { toggleWager(wi, slotIdx); return; }
                        if (!wordSolved[wi] && !casc) setActive(wi);
                      }}
                    >
                      {display}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="lb-bank">
          <div className="lb-bank-row">
            <span className="lb-bank-label">in phrase:</span>
            {presentGlobal.length === 0
              ? <span className="lb-bank-label">—</span>
              : presentGlobal.map(L => <span key={`p${L}`} className="lb-chip yellow">{L}</span>)}
          </div>
          {active !== null && absentByWord[active] && absentByWord[active].length > 0 && (
            <div className="lb-bank-row">
              <span className="lb-bank-label">not in word {active + 1}:</span>
              {absentByWord[active].map(L => <span key={`a${L}`} className="lb-chip absent">{L}</span>)}
            </div>
          )}
        </div>
        </main>

        {phase === "playing" && (
          <div className="lb-bar" role="region" aria-label="Game actions">
            <div className="lb-bar-inner">
              <button className="lb-allin" onClick={openAllIn} disabled={casc} aria-label="Shove the entire phrase: massive bonus or game over">ALL IN</button>
              <div className="lb-prompt" style={{textAlign:"right"}}>
                {active !== null && (() => {
                  const w = wagers[active]?.length || 0;
                  return w > 0 ? `${w} tile${w===1?"":"s"} staked 2×` : "";
                })()}
              </div>
              <button
                className="lb-igo"
                disabled={active === null || wordSolved[active] || typed[active].length < openSlots(session.words[active], locked[active]).length || casc}
                onClick={() => submit(active)}
                aria-label="Submit the typed word"
              >GO</button>
            </div>
          </div>
        )}

        {toast && <div key={toast.id} className={`lb-toast ${toast.type}`} role="status" aria-live="polite">{toast.text}</div>}
        {helpOpen && <HelpModal onClose={()=>setHelpOpen(false)} />}

        {allInOpen && (
          <div className="lb-ov" onClick={() => setAllInOpen(false)}>
            <div className="lb-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="lb-allin-title">
              <div className="lb-ct" id="lb-allin-title" style={{color:"#FF4D4D"}}>ALL IN</div>
              <div className="lb-cs">Type the entire phrase. Wrong → game over.</div>
              <div className="lb-allin-warn">+{fullCount(session.words, locked) * 8} pts if correct · 0 lives if wrong</div>
              <div className="lb-allin-grid">
                {session.words.map((len, wi) => (
                  <input
                    key={wi}
                    className="lb-allin-input"
                    style={{width: `${Math.max(64, len * 22)}px`}}
                    maxLength={len}
                    value={allInWords[wi] || ""}
                    onChange={e => {
                      const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, len);
                      setAllInWords(prev => prev.map((s, i) => i !== wi ? s : v));
                    }}
                    placeholder={"_".repeat(len)}
                    aria-label={`Word ${wi + 1} of ${session.words.length}, ${len} letters`}
                    autoComplete="off" autoCorrect="off" spellCheck={false}
                  />
                ))}
              </div>
              <button className="lb-btn" style={{background:"#FF4D4D",color:"#1A0000"}} onClick={submitAllIn}>SHOVE IT ALL IN</button>
              <button className="lb-btn lb-bs" onClick={() => setAllInOpen(false)}>Fold</button>
            </div>
          </div>
        )}

        {phase === "won" && reveal && (
          <div className="lb-ov" role="dialog" aria-modal="true" aria-labelledby="lb-won-title">
            <div className="lb-card">
              <div className="lb-ct" id="lb-won-title" style={{color:"#E8920A"}}>Solved</div>
              <div className="lb-cs">{session.category}</div>
              <div className="lb-reveal">{reveal.join(" ")}</div>
              <div className="lb-cred">submitted by <b>{session.submittedBy}</b></div>
              <div className="lb-cf" aria-label={`Final score ${score} points`}>{score}</div>
              <div className="lb-cfl">points</div>
              {stats.streak > 1 && <div style={{fontSize:11,letterSpacing:1.5,color:"#FFD700",marginBottom:14,textTransform:"uppercase"}}>🔥 {stats.streak}-win streak{stats.streak === stats.bestStreak ? " · personal best" : ""}</div>}
              <button className="lb-btn lb-bp" onClick={async () => {
                const text = buildShareCard({ session, locked, score, won: true });
                const r = await copyOrShare(text);
                setShareLbl(r === "copied" ? "✓ Copied" : r === "shared" ? "✓ Shared" : "Couldn't share");
              }}>{shareLbl || "Share result"}</button>
              <button className="lb-btn lb-bs" onClick={goLobby}>Pick another</button>
            </div>
          </div>
        )}

        {phase === "lost" && reveal && (
          <div className="lb-ov" role="dialog" aria-modal="true" aria-labelledby="lb-lost-title">
            <div className="lb-card">
              <div className="lb-ct" id="lb-lost-title" style={{color:"#E84444"}}>House Wins</div>
              <div className="lb-cs">{session.category} · the answer was</div>
              <div className="lb-reveal">{reveal.join(" ")}</div>
              <div className="lb-cred">submitted by <b>{session.submittedBy}</b></div>
              <div className="lb-cf" aria-label={`Final score ${score} points`}>{score}</div>
              <div className="lb-cfl">final points</div>
              <button className="lb-btn lb-bp" onClick={() => start(session.id)}>Try again</button>
              <button className="lb-btn" style={{background:"#1A1815",color:"#E8920A",border:"1px solid #E8920A"}} onClick={async () => {
                const text = buildShareCard({ session, locked, score, won: false });
                const r = await copyOrShare(text);
                setShareLbl(r === "copied" ? "✓ Copied" : r === "shared" ? "✓ Shared" : "Couldn't share");
              }}>{shareLbl || "Share result"}</button>
              <button className="lb-btn lb-bs" onClick={goLobby}>Pick another</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── HELP MODAL ────────────────────────────────────────────── */
function HelpModal({ onClose }) {
  return (
    <div className="lb-ov" onClick={onClose}>
      <div className="lb-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="lb-help-title">
        <div className="lb-ct" id="lb-help-title" style={{color:"#E8920A",fontSize:32}}>HOW TO PLAY</div>
        <div className="lb-cs">One subject. One phrase. No mercy.</div>
        <div style={{textAlign:"left",fontSize:13,lineHeight:1.5,color:"#C0BBB5",margin:"8px 0 18px"}}>
          <p style={{marginBottom:10}}><b style={{color:"#F0EDE4"}}>1 · Type into tiles.</b> Pick a word, type its letters into the tiles. Press Enter or tap GO.</p>
          <p style={{marginBottom:10}}><b style={{color:"#4EAF7C"}}>2 · Greens lock in.</b> Letters in the right spot stay revealed across attempts. Letters known to be in the phrase pile up below.</p>
          <p style={{marginBottom:10}}><b style={{color:"#FFD700"}}>3 · Stake tiles 2×.</b> Tap any tile you've typed before submitting — right pays double, wrong costs double.</p>
          <p style={{marginBottom:10}}><b style={{color:"#4EAF7C"}}>4 · Cold solves earn ⚡.</b> Solve a word with no wrong attempts → tap any unrevealed tile in any unsolved word for a free letter.</p>
          <p style={{marginBottom:0}}><b style={{color:"#FF4D4D"}}>5 · ALL IN.</b> Shove the whole phrase. Right = +8 × every unrevealed tile. Wrong = game over.</p>
        </div>
        <button className="lb-btn lb-bp" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

/* ─── AUTH MODAL ────────────────────────────────────────────── */
function AuthModal({ onClose, onAuthed }) {
  const [tab,    setTab]    = useState("login");  // login | register
  const [handle, setHandle] = useState("");
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState(null);
  const passkey = isPasskeySupported();

  const doIt = async (fn) => {
    setBusy(true); setErr(null);
    try {
      const me = await fn(handle.trim().toLowerCase());
      if (me?.user) onAuthed(me.user);
      else setErr("auth-failed");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lb-ov" onClick={onClose}>
      <div className="lb-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="lb-auth-title">
        <div className="lb-ct" id="lb-auth-title" style={{color:"#E8920A"}}>SIGN IN</div>
        <div className="lb-cs">Anonymous play · login only to submit</div>
        <div className="lb-tabs">
          <button className={tab==="login"?"on":""}    onClick={()=>setTab("login")}>LOG IN</button>
          <button className={tab==="register"?"on":""} onClick={()=>setTab("register")}>NEW HANDLE</button>
        </div>
        <div className="lb-form">
          <div className="lb-field">
            <label className="lb-flabel">Handle</label>
            <input
              className="lb-finput"
              autoCapitalize="off" autoCorrect="off" spellCheck={false}
              value={handle}
              onChange={e=>setHandle(e.target.value)}
              placeholder="2–24 chars · letters, numbers, _ -"
            />
            <span className="lb-fhint">Public attribution on your puzzles.</span>
          </div>
          {err && <div className="lb-ferror">{err}</div>}
        </div>
        {passkey
          ? <button className="lb-btn lb-bp" disabled={busy || !handle} onClick={() => doIt(tab==="login" ? loginPasskey : registerPasskey)}>
              {busy ? "…" : tab==="login" ? "USE PASSKEY" : "CREATE PASSKEY"}
            </button>
          : <div className="lb-fhint">This browser doesn't support passkeys.</div>}
        {isDev() && (
          <button className="lb-btn lb-bs" disabled={busy || !handle} onClick={() => doIt(devLogin)}>
            DEV LOGIN (no passkey)
          </button>
        )}
        <button className="lb-btn lb-bs" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/* ─── SUBMIT FORM ───────────────────────────────────────────── */
function SubmitForm({ onCancel, onSubmitted, toast$ }) {
  const [category, setCategory] = useState("");
  const [phrase,   setPhrase]   = useState("");
  const [anchors,  setAnchors]  = useState([]); // [{wi,li}]
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState(null);

  const cleanPhrase = phrase.trim().toUpperCase().replace(/[^A-Z ]/g,"").replace(/\s+/g," ");
  const words = cleanPhrase ? cleanPhrase.split(" ") : [];
  const totalLetters = words.reduce((a,w)=>a+w.length,0);

  const toggleAnchor = (wi, li) => {
    setAnchors(prev => {
      const exists = prev.some(a => a.wi===wi && a.li===li);
      if (exists) return prev.filter(a => !(a.wi===wi && a.li===li));
      if (prev.length >= Math.max(2, words.length)) return prev;
      return [...prev, { wi, li }];
    });
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.submit({ category: category.trim(), phrase: cleanPhrase, anchors });
      onSubmitted();
    } catch (e) {
      setErr(String(e.data?.detail || e.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{width:"100%",maxWidth:480}}>
      <div className="lb-form">
        <div className="lb-field">
          <label className="lb-flabel">Category</label>
          <input className="lb-finput" value={category}
            onChange={e=>setCategory(e.target.value)}
            placeholder="e.g. MOVIE QUOTES" maxLength={30} />
        </div>
        <div className="lb-field">
          <label className="lb-flabel">Phrase</label>
          <input className="lb-finput" value={phrase}
            onChange={e=>setPhrase(e.target.value)}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            placeholder="2–10 words · letters only" />
          <span className="lb-fhint">{words.length} word{words.length===1?"":"s"} · {totalLetters} letters · max 36</span>
        </div>
        {words.length > 0 && (
          <div className="lb-field">
            <label className="lb-flabel">Tap up to {Math.max(2, words.length)} tiles to mark as free anchors</label>
            <div className="lb-preview">
              {words.map((w,wi) => (
                <div className="lb-pword" key={wi}>
                  {w.split("").map((ch,li) => {
                    const isAnchor = anchors.some(a=>a.wi===wi&&a.li===li);
                    return (
                      <div key={li}
                        className={`lb-ptile${isAnchor?" anchor":""}`}
                        onClick={()=>toggleAnchor(wi,li)}>
                        {isAnchor ? ch : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        {err && <div className="lb-ferror">{err}</div>}
      </div>
      <button className="lb-btn lb-bp" disabled={busy || !category || !phrase} onClick={submit}>
        {busy ? "…" : "SUBMIT FOR REVIEW"}
      </button>
      <button className="lb-btn lb-bs" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/* ─── MODERATE LIST ─────────────────────────────────────────── */
function ModerateList({ toast$, onChange }) {
  const [list, setList] = useState(null);
  const [err,  setErr]  = useState(null);

  const load = () => api.modPending().then(setList).catch(e => setErr(String(e.message || e)));
  useEffect(() => { load(); }, []);

  const decide = async (id, status) => {
    try {
      await api.modDecide(id, status);
      toast$(status === "approved" ? "APPROVED" : "REJECTED", status === "approved" ? "great" : "bad");
      load();
      onChange?.();
    } catch (e) {
      toast$(String(e.message || e), "bad");
    }
  };

  if (err) return <div className="lb-ferror">{err}</div>;
  if (!list) return <div className="lb-cred">loading…</div>;
  if (!list.length) return <div className="lb-cred">queue empty.</div>;

  return (
    <div className="lb-mod-list">
      {list.map(s => (
        <div className="lb-mod-item" key={s.id}>
          <div className="lb-mod-meta">
            <span className="lb-mod-cat">{s.category}</span>
            <span className="lb-mod-by">by {s.submittedBy}</span>
          </div>
          <div className="lb-mod-phrase">{s.phrase}</div>
          <div className="lb-mod-actions">
            <button className="lb-mod-btn ok" onClick={() => decide(s.id, "approved")}>APPROVE</button>
            <button className="lb-mod-btn no" onClick={() => decide(s.id, "rejected")}>REJECT</button>
          </div>
        </div>
      ))}
    </div>
  );
}
