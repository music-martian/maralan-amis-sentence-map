/**
 * Minimal Learn / Practice shell for 馬蘭阿美語 sentence maps.
 */
(function () {
  "use strict";

  const data = typeof GREETINGS !== "undefined" ? GREETINGS : window.GREETINGS;
  if (!data || !data.sentences || !data.sentences.length) {
    document.body.innerHTML =
      "<p style='padding:2rem;color:#fff;font-family:sans-serif'>Missing greetings data (data.js).</p>";
    return;
  }

  const sentences = data.sentences;
  const state = {
    index: 0,
    mode: "learn", // 'learn' | 'practice'
    revealed: new Set(),
  };

  const els = {
    body: document.body,
    amis: document.getElementById("meta-amis"),
    zh: document.getElementById("meta-zh"),
    en: document.getElementById("meta-en"),
    num: document.getElementById("meta-num"),
    diagram: document.getElementById("diagram"),
    dots: document.getElementById("dots"),
    select: document.getElementById("sentence-select"),
    prev: document.getElementById("btn-prev"),
    next: document.getElementById("btn-next"),
    modeLearn: document.getElementById("mode-learn"),
    modePractice: document.getElementById("mode-practice"),
    practiceBar: document.getElementById("practice-bar"),
    practiceHint: document.getElementById("practice-hint"),
    progress: document.getElementById("progress"),
    revealAll: document.getElementById("btn-reveal-all"),
    nextQ: document.getElementById("btn-next-q"),
    colorLegend: document.getElementById("color-legend"),
    audioBtn: document.getElementById("btn-audio"),
    audio: document.getElementById("sentence-audio"),
    audioNote: document.getElementById("audio-note"),
  };

  function current() {
    return sentences[state.index];
  }

  function tokenCount(s) {
    return s.tokens.length;
  }

  function stopAudio() {
    if (!els.audio) return;
    els.audio.pause();
    els.audio.currentTime = 0;
    if (els.audioBtn) els.audioBtn.classList.remove("is-playing");
  }

  function syncAudio(s) {
    if (!els.audio || !els.audioBtn) return;
    stopAudio();
    const url = s.audio || "";
    if (!url) {
      els.audio.removeAttribute("src");
      els.audioBtn.disabled = true;
      els.audioBtn.title = "此句無音訊";
      if (els.audioNote) {
        els.audioNote.hidden = true;
        els.audioNote.textContent = "";
      }
      return;
    }
    els.audioBtn.disabled = false;
    els.audioBtn.title = "播放音訊";
    if (els.audio.getAttribute("src") !== url) {
      els.audio.setAttribute("src", url);
      els.audio.load();
    }
    // Hint: Klokah clips are per-exchange (often A/B/C), not per unique line
    if (els.audioNote) {
      const multiExchange = s.id !== "07";
      if (multiExchange) {
        els.audioNote.hidden = false;
        els.audioNote.textContent = s.audio_primary
          ? "音訊為 Klokah 對話段（可能含多句）"
          : "音訊為整段對話（含前後句），非單句錄音";
      } else {
        els.audioNote.hidden = true;
        els.audioNote.textContent = "";
      }
    }
  }

  function playAudio() {
    if (!els.audio || !els.audioBtn || els.audioBtn.disabled) return;
    if (!els.audio.getAttribute("src")) return;
    if (!els.audio.paused) {
      stopAudio();
      return;
    }
    els.audio.play().then(
      () => {
        els.audioBtn.classList.add("is-playing");
      },
      (err) => {
        els.audioBtn.classList.remove("is-playing");
        console.warn("Audio play failed (CORS/hotlink?):", err);
        if (els.audioNote) {
          els.audioNote.hidden = false;
          els.audioNote.textContent =
            "無法播放（可能被瀏覽器或熱連結限制擋下）";
        }
      }
    );
  }

  function setMode(mode) {
    state.mode = mode;
    state.revealed = new Set();
    els.body.classList.toggle("mode-practice", mode === "practice");
    els.body.classList.toggle("mode-learn", mode === "learn");
    els.modeLearn.setAttribute("aria-pressed", mode === "learn" ? "true" : "false");
    els.modePractice.setAttribute("aria-pressed", mode === "practice" ? "true" : "false");
    els.practiceBar.hidden = mode !== "practice";
    els.practiceHint.hidden = mode !== "practice";
    els.colorLegend.hidden = mode === "practice";
    render();
  }

  function go(i) {
    if (i < 0 || i >= sentences.length) return;
    state.index = i;
    state.revealed = new Set();
    render();
  }

  function onReveal(tokenId) {
    if (state.mode !== "practice") return;
    if (state.revealed.has(tokenId)) return;
    state.revealed.add(tokenId);
    render();
  }

  function revealAll() {
    current().tokens.forEach((t) => state.revealed.add(t.id));
    render();
  }

  function buildDots() {
    els.dots.innerHTML = "";
    sentences.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = s.zh;
      b.setAttribute("aria-label", "Sentence " + (i + 1) + ": " + s.zh);
      if (i === state.index) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => go(i));
      els.dots.appendChild(b);
    });
  }

  function buildSelect() {
    if (els.select.options.length) return;
    sentences.forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = i + 1 + ". " + s.zh;
      els.select.appendChild(opt);
    });
  }

  function updateMeta(s) {
    els.num.textContent = state.index + 1 + " / " + sentences.length + "  ·  馬蘭阿美語 句型圖";
    els.amis.textContent = s.amis;
    els.zh.textContent = s.zh;
    els.en.textContent = s.en;
    els.select.value = String(state.index);
    els.prev.disabled = state.index === 0;
    els.next.disabled = state.index === sentences.length - 1;
    syncAudio(s);
  }

  function updateProgress(s) {
    if (state.mode !== "practice") return;
    const n = state.revealed.size;
    const m = tokenCount(s);
    els.progress.textContent = "已顯示 " + n + " / " + m;
    els.nextQ.disabled = state.index >= sentences.length - 1;
  }

  function render() {
    const s = current();
    updateMeta(s);
    buildDots();
    updateProgress(s);

    renderDiagram(els.diagram, s, {
      practice: state.mode === "practice",
      revealed: state.revealed,
      onReveal: onReveal,
    });
  }

  // Wire events
  els.modeLearn.addEventListener("click", () => setMode("learn"));
  els.modePractice.addEventListener("click", () => setMode("practice"));
  els.prev.addEventListener("click", () => go(state.index - 1));
  els.next.addEventListener("click", () => go(state.index + 1));
  els.select.addEventListener("change", () => go(Number(els.select.value)));
  els.revealAll.addEventListener("click", revealAll);
  els.nextQ.addEventListener("click", () => go(state.index + 1));
  if (els.audioBtn) els.audioBtn.addEventListener("click", playAudio);
  if (els.audio) {
    els.audio.addEventListener("ended", () => {
      if (els.audioBtn) els.audioBtn.classList.remove("is-playing");
    });
    els.audio.addEventListener("pause", () => {
      if (els.audio && els.audio.paused && els.audioBtn) {
        els.audioBtn.classList.remove("is-playing");
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "SELECT" || e.target.tagName === "INPUT")) return;
    if (e.key === "ArrowLeft") go(state.index - 1);
    if (e.key === "ArrowRight") go(state.index + 1);
  });

  buildSelect();
  setMode("learn");
})();
