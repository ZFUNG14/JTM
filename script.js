// ---- AOS ----
window.addEventListener("load", () => {
  AOS.init({
    duration: 800,
    once: false,
  });
  AOS.refresh();
});

// ---- Countdown ----
const eventDate = new Date("November 15, 2025 09:00:00 GMT+0800").getTime();

function updateCountdown() {
  const now = Date.now();
  const distance = eventDate - now;

  const days = Math.max(0, Math.floor(distance / (1000 * 60 * 60 * 24)));
  const hours = Math.max(
    0,
    Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  );
  const minutes = Math.max(
    0,
    Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60))
  );
  const seconds = Math.max(0, Math.floor((distance % (1000 * 60)) / 1000));

  const pad = (n) => String(n).padStart(2, "0");
  document.getElementById("days").textContent = pad(days);
  document.getElementById("hours").textContent = pad(hours);
  document.getElementById("minutes").textContent = pad(minutes);
  document.getElementById("seconds").textContent = pad(seconds);

  if (distance < 0) {
    const c = document.querySelector(".countdown");
    if (c)
      c.innerHTML =
        '<h1 style="color:#FFD700;font-size:48px;">The Event Has Started!</h1>';
  }
}
updateCountdown();
setInterval(updateCountdown, 1000);

// ---- Schedule: soft-compress long empty gaps and cap max blank space ----
function initSchedule() {
  const wrap = document.querySelector(".sched-wrap");
  if (!wrap) return;

  const list     = wrap.querySelector(".sched-list");
  const dayStart = new Date(wrap.dataset.start);
  const dayEnd   = new Date(wrap.dataset.end);

  function scaleForViewport() {
    const vw = Math.max(
      document.documentElement.clientWidth,
      window.innerWidth || 0
    );
    return {
      pxPerMin:
        vw >= 1600
          ? 1.0
          : vw >= 1200
          ? 1.15
          : vw >= 900
          ? 1.25
          : vw >= 520
          ? 1.6
          : 2.2,
      minBlock: vw < 520 ? 64 : vw < 900 ? 56 : 48,
      minGap: vw < 520 ? 12 : 10,
      // hard cap really long empty windows so the UI never looks "stretched"
      maxGap: vw >= 1400 ? 16 : vw >= 900 ? 14 : 12,
    };
  }

  // Build event list (sorted) and the empty "gaps" between them
  const items = [...wrap.querySelectorAll(".sched-item")].sort(
    (a, b) => new Date(a.dataset.start) - new Date(b.dataset.start)
  );

  const gaps = [];
  let cursor = dayStart;
  items.forEach((el) => {
    const s = new Date(el.dataset.start);
    const e = new Date(el.dataset.end);
    if (s > cursor) gaps.push({ start: new Date(cursor), end: new Date(s) });
    cursor = e;
  });
  if (cursor < dayEnd) gaps.push({ start: new Date(cursor), end: new Date(dayEnd) });

  // compress very long gaps (e.g., >45 min) so they don't look huge
  const COMPRESS_THRESHOLD_MIN = 45;
  const COMPRESS_FACTOR = 0.35; // keep 35% of the extra minutes visually

  const compressedGapLen = (mins) =>
    mins <= COMPRESS_THRESHOLD_MIN
      ? mins
      : COMPRESS_THRESHOLD_MIN +
        (mins - COMPRESS_THRESHOLD_MIN) * COMPRESS_FACTOR;

  // Convert any time → vertical offset (uses compressed gaps)
  function compressedOffsetPx(t, pxPerMin) {
    const time = +t;
    const start = +dayStart;
    if (time <= start) return 0;

    let yMin = 0;
    let pos = start;

    for (const g of gaps) {
      const gs = +g.start;
      const ge = +g.end;

      // normal segment before this gap
      const segEnd = Math.min(time, gs);
      if (segEnd > pos) {
        yMin += (segEnd - pos) / 60000; // 1:1 minutes
        pos = segEnd;
      }
      if (time <= gs) break;

      // inside this gap?
      const gapCoveredStart = Math.max(pos, gs);
      const gapCoveredEnd = Math.min(time, ge);
      if (gapCoveredEnd > gapCoveredStart) {
        const coveredMin = (gapCoveredEnd - gapCoveredStart) / 60000;
        yMin += compressedGapLen(coveredMin); // compressed minutes
        pos = gapCoveredEnd;
      }
      if (time <= ge) break;
    }

    // tail after last gap
    if (time > pos) yMin += (time - pos) / 60000;

    return yMin * pxPerMin;
  }

  function layout() {
    const { pxPerMin, minBlock, minGap, maxGap } = scaleForViewport();

    let wrapH = 12; // top padding
    let lastBottom = -Infinity;
    const rowData = [];

    items.forEach((el) => {
      const s = new Date(el.dataset.start);
      const e = new Date(el.dataset.end);

      // ideal top/height driven by (compressed) time
      let topY = 12 + compressedOffsetPx(s, pxPerMin);

      // measure content
      el.style.height = "auto";
      el.style.top = "0px";
      const contentH = el.scrollHeight;

      const timeH = Math.max(
        6,
        compressedOffsetPx(e, pxPerMin) - compressedOffsetPx(s, pxPerMin)
      );
      let height = Math.max(timeH, minBlock, contentH);

      // ---- clamp big blank gaps & avoid overlaps ----
      if (isFinite(lastBottom)) {
        const rawGap = topY - lastBottom;
        if (rawGap > maxGap) topY = lastBottom + maxGap; // cap huge empty spaces
      }
      if (topY < lastBottom + minGap) topY = lastBottom + minGap; // keep a minimum gap

      // apply
      el.style.top = `${topY}px`;
      el.style.height = `${height}px`;

      lastBottom = topY + height;
      wrapH = Math.max(wrapH, lastBottom + 20);
      rowData.push({ el, s, e });
    });

    wrap.style.height = `${wrapH}px`;

    // --- highlight the row that's happening now (no line) ---
    function perthNow(){
      try {
        return new Date(
          new Date().toLocaleString("en-US", { timeZone: "Australia/Perth" })
        );
      } catch {
        return new Date();
      }
    }

    function tick(){
      const now = perthNow();
      const sameDay =
        now.toISOString().slice(0,10) === dayStart.toISOString().slice(0,10);

      rowData.forEach(r => {
        const active = sameDay && now >= r.s && now < r.e;
        r.el.classList.toggle("is-current", active);
      });
    }

    tick();
    clearInterval(layout._timer);
    layout._timer = setInterval(tick, 30000);

    }

  const ro = new ResizeObserver(layout);
  items.forEach((el) => ro.observe(el));

  const mo = new MutationObserver(layout);
  mo.observe(list, { childList: true, subtree: true, characterData: true });

  window.addEventListener("resize", layout, { passive: true });

  layout();
}

window.addEventListener("load", initSchedule);

// ===== Lucky Draw Modal (first-visit) =====
(function initLuckyDrawModal(){
  const MODAL_KEY = 'jtm.lucky.modal.seenAt';
  const SHOW_INTERVAL_HOURS = 24;

  const modal = document.getElementById('luckyModal');
  if (!modal) return;

  const btnClose = document.getElementById('luckyModalClose');
  const btnLearn = document.getElementById('luckyLearnBtn');

  // show/hide helpers
  function setBackgroundInert(isInert){
    // inert all direct children except the modal
    [...document.body.children].forEach(el=>{
      if (el === modal) return;
      if (isInert) {
        el.setAttribute('inert','');
        el.setAttribute('aria-hidden','true');
      } else {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      }
    });
  }

  // Focus trap
  const focusSelectors = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  function trapFocus(e){
    if (e.key !== 'Tab') return;
    const nodes = modal.querySelectorAll(focusSelectors);
    if (!nodes.length) return;
    const first = nodes[0];
    const last  = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && active === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  }

  function openModal(){
    // first focusable element
    modal.classList.add('is-open');
    document.body.classList.add('modal-open');
    setBackgroundInert(true);
    modal.setAttribute('aria-hidden','false');
    // move focus in
    const firstFocusable = modal.querySelector(focusSelectors);
    (firstFocusable || modal).focus();
    document.addEventListener('keydown', trapFocus);
    document.addEventListener('keydown', onEsc);
  }

  function closeModal(){
    modal.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    setBackgroundInert(false);
    modal.setAttribute('aria-hidden','true');
    document.removeEventListener('keydown', trapFocus);
    document.removeEventListener('keydown', onEsc);
    // remember for 24h
    localStorage.setItem(MODAL_KEY, Date.now().toString());
  }

  function onEsc(e){ if (e.key === 'Escape') closeModal(); }

  // Wire buttons
  btnClose?.addEventListener('click', closeModal);
  btnLearn?.addEventListener('click', closeModal); // close and jump to #lucky-draw

  // Only show if we haven't in the last 24h
  const lastSeen = Number(localStorage.getItem(MODAL_KEY) || 0);
  const hoursSince = (Date.now() - lastSeen) / (1000*60*60);
  if (isNaN(hoursSince) || hoursSince >= SHOW_INTERVAL_HOURS) {
    // wait for page paint so backdrop sits over AOS content
    window.requestAnimationFrame(openModal);
  }
})();