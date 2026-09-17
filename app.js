/**
 * Learn / Practice shell for 馬蘭阿美語 sentence maps.
 * Cascading Module → Type → Unit selectors; fetches per-unit JSON on Pages.
 */
(function () {
  "use strict";

  const catalog =
    typeof CATALOG !== "undefined"
      ? CATALOG
      : typeof window !== "undefined"
        ? window.CATALOG
        : null;

  const greetingsFallback =
    typeof GREETINGS !== "undefined"
      ? GREETINGS
      : typeof window !== "undefined"
        ? window.GREETINGS
        : null;

  const state = {
    moduleId: null,
    typeId: null,
    unitId: null,
    unitMeta: null,
    unitData: null,
    sentences: [],
    index: 0,
    mode: "learn",
    revealed: new Set(),
    loading: false,
  };

  const els = {
    body: document.body,
    subtitle: document.getElementById("unit-subtitle"),
    klokah: document.getElementById("klokah-link"),
    footerUnit: document.getElementById("footer-unit"),
    selModule: document.getElementById("sel-module"),
    selType: document.getElementById("sel-type"),
    selUnit: document.getElementById("sel-unit"),
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
    loadStatus: document.getElementById("load-status"),
  };

  function findModule(id) {
    return (catalog.modules || []).find((m) => m.id === id);
  }

  function findType(mod, typeId) {
    return (mod.types || []).find((t) => t.id === typeId);
  }

  function findUnit(type, unitId) {
    return (type.units || []).find((u) => u.id === unitId);
  }

  function findUnitInCatalog(unitId) {
    for (const mod of catalog.modules || []) {
      for (const typ of mod.types || []) {
        for (const u of typ.units || []) {
          if (u.id === unitId) {
            return { mod, typ, unit: u };
          }
        }
      }
    }
    return null;
  }

  function fillSelect(sel, items, getValue, getLabel, selected) {
    sel.innerHTML = "";
    items.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = getValue(item);
      opt.textContent = getLabel(item);
      sel.appendChild(opt);
    });
    if (selected != null) sel.value = selected;
  }

  function populateModules(preferred) {
    const mods = catalog.modules || [];
    fillSelect(
      els.selModule,
      mods,
      (m) => m.id,
      (m) => {
        const n = (m.types || []).reduce(
          (a, t) => a + (t.units || []).reduce((b, u) => b + (u.count || 0), 0),
          0
        );
        return m.title + "（" + n + "）";
      },
      preferred || mods[0]?.id
    );
    state.moduleId = els.selModule.value;
  }

  function populateTypes(preferred) {
    const mod = findModule(state.moduleId);
    const types = (mod && mod.types) || [];
    fillSelect(
      els.selType,
      types,
      (t) => t.id,
      (t) => {
        const n = (t.units || []).reduce((a, u) => a + (u.count || 0), 0);
        return t.title + "（" + (t.units || []).length + "課 / " + n + "句）";
      },
      preferred || types[0]?.id
    );
    state.typeId = els.selType.value;
  }

  function populateUnits(preferred) {
    const mod = findModule(state.moduleId);
    const typ = findType(mod, state.typeId);
    const units = (typ && typ.units) || [];
    fillSelect(
      els.selUnit,
      units,
      (u) => u.id,
      (u) => u.title + "（" + (u.count || 0) + "）",
      preferred || units[0]?.id
    );
    state.unitId = els.selUnit.value;
  }

  function setLoadStatus(msg, isError) {
    if (!els.loadStatus) return;
    if (!msg) {
      els.loadStatus.hidden = true;
      els.loadStatus.textContent = "";
      return;
    }
    els.loadStatus.hidden = false;
    els.loadStatus.textContent = msg;
    els.loadStatus.classList.toggle("is-error", !!isError);
  }

  function unitPath(unitMeta) {
    return unitMeta.path || "data/units/" + unitMeta.id + ".json";
  }

  async function fetchUnit(unitMeta) {
    const path = unitPath(unitMeta);
    // Default greetings: prefer inlined GREETINGS when offline / file://
    if (
      unitMeta.id === "junior_type2_class16" &&
      greetingsFallback &&
      greetingsFallback.sentences &&
      greetingsFallback.sentences.length
    ) {
      try {
        const res = await fetch(path, { cache: "no-cache" });
        if (res.ok) {
          return await res.json();
        }
      } catch (_) {
        /* fall through to inline */
      }
      return {
        id: unitMeta.id,
        title: greetingsFallback.unit || unitMeta.title,
        source_url: greetingsFallback.source || unitMeta.source_url || "",
        sentences: greetingsFallback.sentences,
        hand_tuned: true,
      };
    }
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " for " + path);
    }
    return await res.json();
  }

  async function loadSelectedUnit() {
    const mod = findModule(state.moduleId);
    const typ = findType(mod, state.typeId);
    const unitMeta = findUnit(typ, state.unitId);
    if (!unitMeta) {
      setLoadStatus("找不到單元資料", true);
      return;
    }
    state.unitMeta = unitMeta;
    state.loading = true;
    setLoadStatus("載入單元中…");
    els.diagram.innerHTML = "";
    try {
      const data = await fetchUnit(unitMeta);
      state.unitData = data;
      state.sentences = data.sentences || [];
      state.index = 0;
      state.revealed = new Set();
      setLoadStatus("");
      updateChrome();
      rebuildSentenceSelect();
      setMode(state.mode);
    } catch (err) {
      console.warn(err);
      // file:// fallback only for greetings
      if (
        unitMeta.id === "junior_type2_class16" &&
        greetingsFallback &&
        greetingsFallback.sentences
      ) {
        state.unitData = {
          id: unitMeta.id,
          title: greetingsFallback.unit,
          source_url: greetingsFallback.source,
          sentences: greetingsFallback.sentences,
        };
        state.sentences = greetingsFallback.sentences;
        state.index = 0;
        setLoadStatus(
          "無法 fetch 單元 JSON（file://？）。已改用內建問候單元。其他單元請用本機伺服器開啟。",
          true
        );
        updateChrome();
        rebuildSentenceSelect();
        setMode(state.mode);
      } else {
        state.sentences = [];
        setLoadStatus(
          "無法載入單元（若用 file:// 開啟，請改用：python3 -m http.server）。" +
            String(err && err.message ? err.message : err),
          true
        );
        els.diagram.innerHTML = "";
        updateChrome();
      }
    } finally {
      state.loading = false;
    }
  }

  function updateChrome() {
    const title =
      (state.unitData && state.unitData.title) ||
      (state.unitMeta && state.unitMeta.title) ||
      "";
    const n = state.sentences.length;
    if (els.subtitle) {
      els.subtitle.textContent = title
        ? title + "（" + n + " 句）"
        : "選擇單元開始學習";
    }
    const src =
      (state.unitData && state.unitData.source_url) ||
      (state.unitMeta && state.unitMeta.source_url) ||
      (catalog && catalog.hub_url) ||
      "https://klokah.iformosa.com.tw/";
    if (els.klokah) els.klokah.href = src;
    if (els.footerUnit) {
      els.footerUnit.textContent =
        "Klokah · 馬蘭阿美語 · " + (title || "句型圖");
    }
  }

  function current() {
    return state.sentences[state.index];
  }

  function tokenCount(s) {
    return (s.tokens || []).length;
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
    const url = (s && s.audio) || "";
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
    if (els.audioNote) {
      const note =
        s.audio_note ||
        (s.audio_primary === false
          ? "音訊為整段對話（含前後句），非單句錄音"
          : "");
      if (note) {
        els.audioNote.hidden = false;
        els.audioNote.textContent = note;
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
    els.modePractice.setAttribute(
      "aria-pressed",
      mode === "practice" ? "true" : "false"
    );
    els.practiceBar.hidden = mode !== "practice";
    els.practiceHint.hidden = mode !== "practice";
    els.colorLegend.hidden = mode === "practice";
    render();
  }

  function go(i) {
    if (i < 0 || i >= state.sentences.length) return;
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
    const s = current();
    if (!s) return;
    (s.tokens || []).forEach((t) => state.revealed.add(t.id));
    render();
  }

  function buildDots() {
    els.dots.innerHTML = "";
    const maxDots = 40;
    const n = state.sentences.length;
    if (n > maxDots) {
      // Too many for dots — show compact progress chip instead
      const chip = document.createElement("span");
      chip.className = "dots-chip";
      chip.textContent = state.index + 1 + " / " + n;
      els.dots.appendChild(chip);
      return;
    }
    state.sentences.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = s.zh || s.amis;
      b.setAttribute("aria-label", "Sentence " + (i + 1));
      if (i === state.index) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => go(i));
      els.dots.appendChild(b);
    });
  }

  function rebuildSentenceSelect() {
    els.select.innerHTML = "";
    state.sentences.forEach((s, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      const label = (s.zh || s.amis || "").slice(0, 40);
      opt.textContent = i + 1 + ". " + label;
      els.select.appendChild(opt);
    });
  }


  /** Insert line breaks after sentence-ending punctuation (keep punctuation).
   * Ignore .!?。！？ inside ASCII/“” quotes and 「」 pairs so titles stay intact.
   */
  function breakSentences(text) {
    if (!text) return "";
    const raw = String(text).replace(/\r\n/g, "\n").trim();
    let out = "";
    let inDq = false;
    let corner = 0;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"' || ch === "\u201c" || ch === "\u201d") {
        inDq = !inDq;
        out += ch;
      } else if (ch === "\u300c") {
        corner += 1;
        out += ch;
      } else if (ch === "\u300d") {
        corner = Math.max(0, corner - 1);
        out += ch;
      } else if (/[.!?。！？]/.test(ch) && !inDq && corner === 0) {
        out += ch;
        const rest = raw.slice(i + 1);
        if (!/^["'」』）\)]?\s*$/.test(rest)) out += "\n";
      } else {
        out += ch;
      }
    }
    out = out
      .split("\n")
      .map((ln) => ln.trim())
      .filter((ln, i, arr) => ln || (i > 0 && arr[i - 1]))
      .join("\n");
    return out.replace(/\n{3,}/g, "\n\n");
  }

  function updateMeta(s) {
    const n = state.sentences.length;
    const title =
      (state.unitData && state.unitData.title) ||
      (state.unitMeta && state.unitMeta.title) ||
      "";
    els.num.textContent =
      (n ? state.index + 1 + " / " + n : "—") +
      "  ·  馬蘭阿美語 句型圖" +
      (title ? " · " + title : "");
    if (!s) {
      els.amis.textContent = "";
      els.zh.textContent = "";
      els.en.textContent = "";
      els.prev.disabled = true;
      els.next.disabled = true;
      syncAudio(null);
      return;
    }
    const amisText = breakSentences(s.amis || "");
    const zhText = breakSentences(s.zh || "");
    const enText = breakSentences(s.en || "");
    els.amis.textContent = amisText;
    els.zh.textContent = zhText;
    els.en.textContent = enText;
    els.en.hidden = !enText;
    const long =
      amisText.length > 70 ||
      zhText.length > 70 ||
      (amisText + zhText).includes("\n");
    els.amis.classList.toggle("is-long", long);
    els.zh.classList.toggle("is-long", long);
    els.en.classList.toggle("is-long", long && !!enText);
    els.select.value = String(state.index);
    els.prev.disabled = state.index === 0;
    els.next.disabled = state.index >= n - 1;
    syncAudio(s);
  }

  function updateProgress(s) {
    if (state.mode !== "practice") return;
    if (!s) {
      els.progress.textContent = "已顯示 0 / 0";
      return;
    }
    const n = state.revealed.size;
    const m = tokenCount(s);
    els.progress.textContent = "已顯示 " + n + " / " + m;
    els.nextQ.disabled = state.index >= state.sentences.length - 1;
  }

  function render() {
    const s = current();
    updateMeta(s);
    buildDots();
    updateProgress(s);
    if (!s) {
      els.diagram.innerHTML = "";
      return;
    }
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

  els.selModule.addEventListener("change", () => {
    state.moduleId = els.selModule.value;
    populateTypes();
    populateUnits();
    loadSelectedUnit();
  });
  els.selType.addEventListener("change", () => {
    state.typeId = els.selType.value;
    populateUnits();
    loadSelectedUnit();
  });
  els.selUnit.addEventListener("change", () => {
    state.unitId = els.selUnit.value;
    loadSelectedUnit();
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.target &&
      (e.target.tagName === "SELECT" || e.target.tagName === "INPUT")
    )
      return;
    if (e.key === "ArrowLeft") go(state.index - 1);
    if (e.key === "ArrowRight") go(state.index + 1);
  });

  // Boot
  if (!catalog || !catalog.modules || !catalog.modules.length) {
    document.body.innerHTML =
      "<p style='padding:2rem;color:#fff;font-family:sans-serif'>Missing catalog.js</p>";
    return;
  }

  const defaultId = catalog.default_unit || "junior_type2_class16";
  const found = findUnitInCatalog(defaultId);
  if (found) {
    populateModules(found.mod.id);
    populateTypes(found.typ.id);
    populateUnits(found.unit.id);
  } else {
    populateModules();
    populateTypes();
    populateUnits();
  }
  loadSelectedUnit();
})();
