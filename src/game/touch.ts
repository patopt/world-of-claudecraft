// Touch controls for phones/tablets (and the iOS app): a virtual joystick
// drives movement through Input.touchMove, one-finger drag on the canvas
// orbits the camera, two fingers pinch-zoom, tap targets (left-pick) and
// double-tap attacks/loots/talks (right-pick). A small button cluster covers
// the keys a phone has no keyboard for: jump, interact, target, chat.

import type { Input, InputCallbacks } from './input';

export function isTouchDevice(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

const JOY_RADIUS = 52; // px from center to full deflection
const TAP_MS = 300;
const TAP_SLOP = 14; // px of movement that still counts as a tap
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 48;

export class TouchControls {
  private joyTouchId: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private camTouchId: number | null = null;
  private camLast = { x: 0, y: 0 };
  private camStart = { x: 0, y: 0, t: 0 };
  private camMoved = 0;
  private pinchDist: number | null = null;
  private lastTap = { x: 0, y: 0, t: 0 };

  constructor(private canvas: HTMLCanvasElement, private input: Input, private cb: InputCallbacks) {
    document.body.classList.add('touch');
    this.buildDom();
    canvas.addEventListener('touchstart', (e) => this.onCanvasTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onCanvasTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onCanvasTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onCanvasTouchEnd(e), { passive: false });
  }

  private buildDom(): void {
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    ui.innerHTML = `
      <div id="touch-joy"><div id="touch-joy-nub"></div></div>
      <div id="touch-buttons">
        <div class="touch-btn" data-act="target">◎</div>
        <div class="touch-btn" data-act="interact">✋</div>
        <div class="touch-btn" data-act="jump">⤊</div>
        <div class="touch-btn touch-btn-small" data-act="chat">💬</div>
      </div>`;
    document.body.appendChild(ui);

    const joy = ui.querySelector('#touch-joy') as HTMLElement;
    const nub = ui.querySelector('#touch-joy-nub') as HTMLElement;
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyTouchId = t.identifier;
      const r = joy.getBoundingClientRect();
      this.joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.moveJoy(t.clientX, t.clientY, nub);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyTouchId) this.moveJoy(t.clientX, t.clientY, nub);
      }
    }, { passive: false });
    const joyEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyTouchId) {
          this.joyTouchId = null;
          this.input.touchMove.x = 0;
          this.input.touchMove.y = 0;
          nub.style.transform = 'translate(0px, 0px)';
        }
      }
    };
    joy.addEventListener('touchend', joyEnd);
    joy.addEventListener('touchcancel', joyEnd);

    for (const btn of Array.from(ui.querySelectorAll<HTMLElement>('.touch-btn'))) {
      const act = btn.dataset.act!;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        btn.classList.add('held');
        if (act === 'jump') this.input.touchJump = true;
        else if (act === 'interact') this.cb.onUiKey('interact');
        else if (act === 'target') this.cb.onTab();
        else if (act === 'chat') this.cb.onUiKey('chat');
      }, { passive: false });
      const release = () => {
        btn.classList.remove('held');
        if (act === 'jump') this.input.touchJump = false;
      };
      btn.addEventListener('touchend', release);
      btn.addEventListener('touchcancel', release);
    }
  }

  private moveJoy(x: number, y: number, nub: HTMLElement): void {
    let dx = x - this.joyCenter.x, dy = y - this.joyCenter.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
    this.input.touchMove.x = dx / JOY_RADIUS;
    this.input.touchMove.y = dy / JOY_RADIUS;
    nub.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // -- camera / picking on the 3D canvas -----------------------------------

  private onCanvasTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 2) {
      // second finger: switch from orbit to pinch zoom
      this.camTouchId = null;
      this.pinchDist = this.touchPairDist(e);
      return;
    }
    const t = e.changedTouches[0];
    this.camTouchId = t.identifier;
    this.camLast = { x: t.clientX, y: t.clientY };
    this.camStart = { x: t.clientX, y: t.clientY, t: performance.now() };
    this.camMoved = 0;
  }

  private onCanvasTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length >= 2 && this.pinchDist !== null) {
      const d = this.touchPairDist(e);
      this.input.camDist = Math.min(22, Math.max(3, this.input.camDist - (d - this.pinchDist) * 0.04));
      this.pinchDist = d;
      return;
    }
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.camTouchId) continue;
      const mx = t.clientX - this.camLast.x, my = t.clientY - this.camLast.y;
      this.camMoved += Math.abs(mx) + Math.abs(my);
      this.camLast = { x: t.clientX, y: t.clientY };
      this.input.camYaw -= mx * 0.006;
      this.input.camPitch = Math.min(1.35, Math.max(-0.4, this.input.camPitch + my * 0.006));
    }
  }

  private onCanvasTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length < 2) this.pinchDist = null;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.camTouchId) continue;
      this.camTouchId = null;
      const dt = performance.now() - this.camStart.t;
      if (dt <= TAP_MS && this.camMoved <= TAP_SLOP) {
        const now = performance.now();
        const isDouble = now - this.lastTap.t <= DOUBLE_TAP_MS
          && Math.hypot(t.clientX - this.lastTap.x, t.clientY - this.lastTap.y) <= DOUBLE_TAP_DIST;
        if (isDouble) {
          this.lastTap.t = 0; // consume so a triple-tap doesn't double-fire
          this.cb.onClickPick(t.clientX, t.clientY, 2); // attack / loot / talk
        } else {
          this.lastTap = { x: t.clientX, y: t.clientY, t: now };
          this.cb.onClickPick(t.clientX, t.clientY, 0); // select target
        }
      }
    }
  }

  private touchPairDist(e: TouchEvent): number {
    const a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
}
