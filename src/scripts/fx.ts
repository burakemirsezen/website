// Page-wide effects: a gentle 3D tilt on the platform screenshots that follows
// the pointer. Only for a real mouse, and never with reduced motion.
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const calm = matchMedia('(prefers-reduced-motion: reduce)');

if (fine.matches && !calm.matches) {
  const MAX = 4; // degrees
  for (const el of document.querySelectorAll<HTMLElement>('.shots .shot, .visit-shot')) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ty', `${(x * MAX * 2).toFixed(2)}deg`);
      el.style.setProperty('--tx', `${(-y * MAX * 2).toFixed(2)}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.removeProperty('--tx');
      el.style.removeProperty('--ty');
    });
  }
}
