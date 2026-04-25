/* Tiny dependency-free confetti burst. Spawns a fixed-position canvas, animates
   ~120 particles for ~1.6s, then removes itself. Respects prefers-reduced-motion. */

const COLORS = ["#E8920A", "#FFD700", "#FF6EDF", "#4EAF7C", "#D4B445", "#F0EDE4"];

export function confetti(opts = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const N = opts.count ?? 140;
  const duration = opts.duration ?? 1700;
  const originX = opts.x ?? window.innerWidth / 2;
  const originY = opts.y ?? window.innerHeight / 3;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;";
  canvas.width  = window.innerWidth  * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width  = window.innerWidth  + "px";
  canvas.style.height = window.innerHeight + "px";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const particles = Array.from({ length: N }, () => {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 5 + Math.random() * 9;
    return {
      x: originX, y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      g: 0.18 + Math.random() * 0.06,
      drag: 0.985,
      size: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: Math.random() < 0.5 ? "rect" : "circle",
      alpha: 1,
    };
  });

  const start = performance.now();
  function frame(t) {
    const elapsed = t - start;
    const fadeAt = duration * 0.65;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x  += p.vx;
      p.y  += p.vy;
      p.rot += p.vr;
      p.alpha = elapsed < fadeAt ? 1 : Math.max(0, 1 - (elapsed - fadeAt) / (duration - fadeAt));
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size * 0.6);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size/2, 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
    }
    if (elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
