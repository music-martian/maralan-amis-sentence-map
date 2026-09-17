/**
 * Live SVG sentence-map renderer for 馬蘭阿美語.
 * Mirrors layout/colors from generate_diagrams.py (mint canvas, bead-row + attachment map).
 */
(function (global) {
  "use strict";

  const COLORS = {
    frame: "#2A6A3A",
    mint: "#8FCF96",
    map: "#E4E4E4",
    black: "#111111",
    text: "#1A1A1A",
    gloss: "#1F3D28",
    footer: "#163322",
    white: "#FFFFFF",
    pred: "#C9A6E8",
    pronoun: "#E8B4C4",
    noun: "#B7D9B8",
    case: "#5B8DEF",
    particle: "#E8C84A",
    adverb: "#E8C84A",
    pred2: "#E88888",
  };

  const ROLE_META = {
    pred: { fill: COLORS.pred, fg: COLORS.text, shape: "capsule", label: "謂語" },
    pred2: { fill: COLORS.pred2, fg: COLORS.text, shape: "capsule", label: "第二子句謂語" },
    pronoun: { fill: COLORS.pronoun, fg: COLORS.text, shape: "capsule", label: "代詞" },
    noun: { fill: COLORS.noun, fg: COLORS.text, shape: "capsule", label: "名詞" },
    case: { fill: COLORS.case, fg: COLORS.white, shape: "oval", label: "格標記" },
    particle: { fill: COLORS.particle, fg: COLORS.text, shape: "diamond", label: "助詞" },
    adverb: { fill: COLORS.adverb, fg: COLORS.text, shape: "capsule", label: "副詞" },
  };

  const LEGEND = [
    [COLORS.pred, "謂語 pred"],
    [COLORS.pronoun, "代詞 pronoun"],
    [COLORS.noun, "名詞 noun"],
    [COLORS.case, "格標記 ko/no"],
    [COLORS.particle, "助詞/副詞"],
    [COLORS.pred2, "第二子句謂語"],
  ];

  const FOOTER = "Klokah · 馬蘭阿美語 · 句型圖（自動標記）";

  // Glottal letters are NOT punctuation in Amis (keep on word beads).
  const PUNCT_CHARS = "¿¡?!！？。．.,，,;；:…/／\"\"「」『』（）()[]";
  const PUNCT_RE = new RegExp("^[" + PUNCT_CHARS.replace(/[\]\[\\]/g, "\\$&") + "]+$");

  function isPunctText(text) {
    return !!text && PUNCT_RE.test(String(text));
  }

  function isPunctToken(tok) {
    if (!tok) return false;
    if (tok.role === "punct") return true;
    return isPunctText(tok.text);
  }

  // Use a full-width display mark for periods so they remain visible at bead size.
  function punctDisplay(text) {
    return String(text == null ? "" : text).replace(/[.．]/g, "。");
  }

  function isPeriodPunct(text) {
    const t = String(text == null ? "" : text);
    return /^[.．。]+$/.test(t);
  }

  /**
   * Render-time safety net: if sentence.amis / text ends with sentence punct
   * but the expanded token list does not, append matching punct token(s).
   */
  function ensureTrailingPunct(tokens, sentence) {
    const list = (tokens || []).slice();
    const amis = (sentence && (sentence.amis || sentence.text)) || "";
    const m = String(amis).trim().match(/[.!?。！？]+$/);
    if (!m) return list;
    const trailing = m[0];
    const norm = (p) =>
      String(p)
        .replace(/。/g, ".")
        .replace(/．/g, ".")
        .replace(/？/g, "?")
        .replace(/！/g, "!");
    let endJoined = "";
    for (let i = list.length - 1; i >= 0; i--) {
      if (isPunctToken(list[i])) endJoined = (list[i].text || "") + endJoined;
      else break;
    }
    if (endJoined && norm(endJoined).endsWith(norm(trailing))) return list;

    const usedIds = new Set(list.map((t) => t && t.id).filter(Boolean));
    function punctIdFor(ch) {
      const base =
        ch === "." || ch === "．" || ch === "。"
          ? "period"
          : ch === "?" || ch === "？"
            ? "q"
            : ch === "!" || ch === "！"
              ? "excl"
              : "punct";
      if (!usedIds.has(base)) return base;
      let n = 2;
      while (usedIds.has(base + "_" + n)) n += 1;
      return base + "_" + n;
    }

    let need = trailing;
    if (endJoined) {
      const nEnd = norm(endJoined);
      const nNeed = norm(trailing);
      for (let k = Math.min(nEnd.length, nNeed.length); k > 0; k--) {
        if (nEnd.endsWith(nNeed.slice(0, k))) {
          need = trailing.slice(k);
          break;
        }
      }
    }
    for (const ch of need) {
      const id = punctIdFor(ch);
      usedIds.add(id);
      list.push({
        id,
        text: ch,
        role: "punct",
        gloss_zh: "",
        gloss_en: "",
      });
    }
    return list;
  }

  /** Mirror build_corpus.tokenize — keep punct as standalone tokens. */
  function tokenizeAmis(amis) {
    if (!amis) return [];
    const out = [];
    String(amis)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .forEach((raw) => {
        splitTokenKeepPunct(raw).forEach((t) => out.push(t));
      });
    return out;
  }

  function splitTokenKeepPunct(tok) {
    if (!tok) return [];
    if (isPunctText(tok)) return Array.from(tok);
    const out = [];
    let i = 0;
    while (i < tok.length && isPunctText(tok[i])) {
      out.push(tok[i]);
      i += 1;
    }
    let j = tok.length;
    while (j > i && isPunctText(tok[j - 1])) j -= 1;
    const mid = tok.slice(i, j);
    const trail = tok.slice(j);
    if (mid) {
      mid.split(/([/／;；])/).forEach((p) => {
        if (p) out.push(p);
      });
    }
    for (const ch of trail) out.push(ch);
    return out;
  }

  /**
   * Expand legacy/glued token text at render time without changing source JSON.
   * Word pieces inherit the source token metadata; punctuation is plain text.
   */
  function expandTokens(rawTokens) {
    const out = [];
    const usedIds = new Set((rawTokens || []).map((t) => t && t.id).filter(Boolean));
    (rawTokens || []).forEach((tok) => {
      if (!tok) return;
      const parts = splitTokenKeepPunct(tok.text);
      const sourceId = tok.id || "token";
      parts.forEach((text, index) => {
        let id = sourceId;
        if (index > 0 || (usedIds.has(id) && out.some((t) => t.id === id))) {
          let suffix = index + 1;
          id = sourceId + "_" + suffix;
          while (usedIds.has(id) || out.some((t) => t.id === id)) {
            suffix += 1;
            id = sourceId + "_" + suffix;
          }
        }
        usedIds.add(id);
        const punct = isPunctText(text);
        out.push(Object.assign({}, tok, {
          id,
          text,
          role: punct ? "punct" : tok.role,
          gloss_zh: punct ? "" : tok.gloss_zh,
          gloss_en: punct ? "" : tok.gloss_en,
          _sourceId: sourceId,
        }));
      });
    });
    return out;
  }

  function expandLayoutIds(ids, tokens) {
    const list = tokens || [];
    const out = [];
    (ids || []).forEach((id) => {
      const matches = list.filter((t) => t._sourceId === id);
      if (matches.length) matches.forEach((t) => out.push(t.id));
      else out.push(id);
    });
    return out;
  }

  function svgEl(name, attrs, children) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === "textContent") {
          el.textContent = v;
          return;
        }
        el.setAttribute(k, String(v));
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        if (typeof c === "string") el.appendChild(document.createTextNode(c));
        else el.appendChild(c);
      });
    }
    return el;
  }

  /** Approximate text width for Latin + CJK mix (no canvas measure needed). */
  function measureText(text, fontSize) {
    if (!text) return 0;
    let w = 0;
    for (const ch of text) {
      const code = ch.codePointAt(0);
      // Glottal letters are narrow — avoid huge gaps inside beads
      if (
        ch === "'" ||
        ch === "’" ||
        ch === "‘" ||
        ch === "ʼ" ||
        ch === "ʾ" ||
        ch === "ʻ" ||
        ch === "`"
      ) {
        w += fontSize * 0.22;
      } else if (code < 0x80 || (code >= 0xa0 && code <= 0x024f)) {
        w += fontSize * 0.58;
      } else {
        w += fontSize * 0.95;
      }
    }
    return w;
  }

  function sizeFor(text, role, fontSize, bead) {
    const displayText = role === "punct" || isPunctText(text) ? punctDisplay(text) : text;
    const tw = measureText(displayText, fontSize);
    const th = fontSize;
    if (role === "punct" || isPunctText(text)) {
      // Keep punct readable — periods need larger glyph + room for filled dot
      const period = isPeriodPunct(text) || isPeriodPunct(displayText);
      const f = period ? (bead ? 28 : 26) : bead ? 22 : 20;
      const twP = measureText(displayText, f);
      const h = bead ? 44 : 50;
      const minW = period ? 28 : 22;
      return { w: Math.max(twP + 12, minW), h, _punctFont: f, _periodDot: period };
    }
    const meta = ROLE_META[role] || ROLE_META.pred;
    if (meta.shape === "oval") {
      const h = Math.max(th + 18, 44);
      const w = Math.max(tw + 22, h * 1.15);
      return { w, h };
    }
    if (meta.shape === "diamond") {
      const d = Math.max(tw + 26, th + 26, 46);
      return { w: d, h: d };
    }
    const padX = bead ? 18 : 20;
    const padY = bead ? 11 : 13;
    const h = Math.max(bead ? 44 : 50, th + padY * 2);
    const w = Math.max(tw + padX * 2, h);
    return { w, h };
  }

  function layoutSequence(nodes, y, gap, tightAfter) {
    tightAfter = tightAfter || new Set();
    if (!nodes.length) return 0;
    let x = 0;
    nodes.forEach((n, i) => {
      if (i > 0) {
        const prev = nodes[i - 1];
        let g = tightAfter.has(prev.id) || prev.role === "case" ? 14 : gap;
        if (n.role === "case") g = 14;
        // Keep a little air around punct so "." / "!" stay visible
        if (isPunctToken(prev) || isPunctToken(n)) g = Math.max(g, 12);
        x += g;
      }
      n.cx = x + n.w / 2;
      n.cy = y;
      x += n.w;
    });
    return x;
  }


  function splitAmisSentences(amis) {
    if (!amis) return [];
    const parts = [];
    let buf = "";
    let inDq = false; // toggle on " / “ / ”
    let corner = 0; // nest depth for 「 … 」
    for (const ch of String(amis)) {
      if (ch === '"' || ch === '\u201c' || ch === '\u201d') {
        inDq = !inDq;
        buf += ch;
      } else if (ch === '\u300c') {
        corner += 1;
        buf += ch;
      } else if (ch === '\u300d') {
        corner = Math.max(0, corner - 1);
        buf += ch;
      } else if (/[.!?。！？]/.test(ch) && !inDq && corner === 0) {
        buf += ch;
        const t = buf.trim();
        if (t) parts.push(t);
        buf = "";
      } else {
        buf += ch;
      }
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts.length ? parts : [String(amis).trim()];
  }

  function wordsInAmisSentence(sent) {
    // Prefer punct-keeping tokenize so counts match bead tokens (incl. ? / ,)
    return tokenizeAmis(sent);
  }

  /**
   * Group bead nodes by sentence boundaries in sentence.amis.
   * Align by re-tokenizing each Amis sentence (punct kept); trailing punct
   * stays with the sentence that owns it.
   */
  function groupBeadsBySentence(nodes, sentence) {
    const sents = splitAmisSentences((sentence && sentence.amis) || "");
    if (!nodes.length) return [];
    if (sents.length <= 1) return [nodes.slice()];
    const groups = [];
    let idx = 0;
    sents.forEach((sent) => {
      const n = wordsInAmisSentence(sent).length;
      if (n <= 0) return;
      // Prefer exact tokenize count (includes punct); if mismatch, fall back
      // to counting only non-punct content words from remaining nodes.
      let take = n;
      const remaining = nodes.length - idx;
      if (take > remaining) take = remaining;
      const slice = nodes.slice(idx, idx + take);
      if (slice.length) groups.push(slice);
      idx += take;
    });
    if (idx < nodes.length) {
      const rest = nodes.slice(idx);
      if (groups.length) groups[groups.length - 1] = groups[groups.length - 1].concat(rest);
      else groups.push(rest);
    }
    return groups.length ? groups : [nodes.slice()];
  }

  /** Pack nodes into rows that fit maxWidth (left-origin; caller may center). */
  function wrapNodesToWidth(nodes, gap, maxWidth) {
    const rows = [];
    let row = [];
    let rowW = 0;
    nodes.forEach((n) => {
      const need = n.w + (row.length ? gap : 0);
      if (row.length && rowW + need > maxWidth) {
        rows.push(row);
        row = [];
        rowW = 0;
      }
      rowW += (row.length ? gap : 0) + n.w;
      row.push(n);
    });
    if (row.length) rows.push(row);
    return rows;
  }

  /**
   * Layout beads: new row at each Amis sentence boundary; also wrap within a
   * sentence when it exceeds maxWidth so long lines are not clipped.
   * rowGap must clear Chinese gloss under each bead (~h/2 + 14 + font).
   */
  function layoutBeadsWrapped(nodes, y0, gap, maxWidth, rowGap, sentence) {
    rowGap = rowGap || 96;
    if (!nodes.length) return { width: 0, height: 0, rows: [], rowCount: 0, rowGap };
    const groups = groupBeadsBySentence(nodes, sentence || {});
    const rows = [];
    let y = y0;
    let maxRowW = 0;

    groups.forEach((group) => {
      if (!group.length) return;
      const subRows = wrapNodesToWidth(group, gap, maxWidth);
      subRows.forEach((sub) => {
        let x = 0;
        sub.forEach((n, i) => {
          if (i) x += gap;
          n.cx = x + n.w / 2;
          n.cy = y;
          n._row = rows.length;
          x += n.w;
        });
        sub._width = x;
        maxRowW = Math.max(maxRowW, x);
        rows.push(sub);
        y += rowGap;
      });
    });

    return {
      width: maxRowW,
      height: rows.length ? (rows.length - 1) * rowGap : 0,
      rows,
      rowCount: rows.length,
      rowGap,
    };
  }


  /** Flatten layout groups into ordered map nodes, then partition by Amis sentence word counts. */
  function partitionMapNodesBySentence(groupsNodes, sentence) {
    const flat = [];
    groupsNodes.forEach((gn) => {
      gn.forEach((n) => flat.push(n));
    });
    if (!flat.length) return [];
    const sents = splitAmisSentences((sentence && sentence.amis) || "");
    if (sents.length <= 1) return [flat];
    const partitions = [];
    let idx = 0;
    sents.forEach((sent) => {
      let n = wordsInAmisSentence(sent).length;
      if (n <= 0) return;
      if (n > flat.length - idx) n = flat.length - idx;
      const slice = flat.slice(idx, idx + n);
      if (slice.length) partitions.push(slice);
      idx += n;
    });
    if (idx < flat.length) {
      const rest = flat.slice(idx);
      if (partitions.length) partitions[partitions.length - 1] = partitions[partitions.length - 1].concat(rest);
      else partitions.push(rest);
    }
    return partitions.length ? partitions : [flat];
  }

  function shiftNodes(nodes, dx, dy) {
    dy = dy || 0;
    nodes.forEach((n) => {
      n.cx += dx;
      n.cy += dy;
    });
  }

  function thickLine(parent, x1, y1, x2, y2, width, color) {
    parent.appendChild(
      svgEl("line", {
        x1, y1, x2, y2,
        stroke: color,
        "stroke-width": width,
        "stroke-linecap": "round",
      })
    );
  }

  function drawTick(parent, x, y, half, width, color) {
    thickLine(parent, x, y - half, x, y + half, width, color);
  }

  function drawPlus(parent, cx, cy, arm, width, color, bg) {
    if (bg) {
      const rr = arm + width + 2;
      parent.appendChild(
        svgEl("circle", { cx, cy, r: rr, fill: bg })
      );
    }
    thickLine(parent, cx - arm, cy, cx + arm, cy, width, color);
    thickLine(parent, cx, cy - arm, cx, cy + arm, width, color);
  }

  function drawShape(parent, node, fontSize, strokeW, displayText, clickable, onClick) {
    const punct = isPunctToken(node);
    const meta = ROLE_META[node.role] || ROLE_META.pred;
    const g = svgEl("g", {
      class: "token-shape" + (punct ? " token-punct" : "") + (clickable ? " clickable" : ""),
      "data-token-id": node.id,
      style: clickable ? "cursor:pointer" : null,
    });

    const x0 = node.cx - node.w / 2;
    const y0 = node.cy - node.h / 2;

    if (punct) {
      // Plain punctuation between/after beads — no capsule, no connector
      const label = displayText == null ? punctDisplay(node.text) : punctDisplay(displayText);
      const period = node._periodDot || isPeriodPunct(node.text) || isPeriodPunct(label);
      const pFont = node._punctFont || (period ? 28 : Math.max(fontSize + 4, 20));
      if (period) {
        // Filled black circle under/as the period so it cannot vanish on mobile
        g.appendChild(
          svgEl("circle", {
            cx: node.cx,
            cy: node.cy,
            r: 6,
            fill: COLORS.black,
          })
        );
      }
      g.appendChild(
        svgEl("text", {
          x: node.cx,
          y: node.cy,
          fill: COLORS.black,
          "font-size": pFont,
          "font-weight": 800,
          "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
          "text-anchor": "middle",
          "dominant-baseline": "central",
          textContent: label,
        })
      );
      parent.appendChild(g);
      return;
    }

    if (meta.shape === "oval") {
      g.appendChild(
        svgEl("ellipse", {
          cx: node.cx,
          cy: node.cy,
          rx: node.w / 2,
          ry: node.h / 2,
          fill: meta.fill,
          stroke: COLORS.black,
          "stroke-width": strokeW,
        })
      );
    } else if (meta.shape === "diamond") {
      const r = Math.max(node.w, node.h) / 2;
      const pts = [
        [node.cx, node.cy - r],
        [node.cx + r, node.cy],
        [node.cx, node.cy + r],
        [node.cx - r, node.cy],
      ]
        .map((p) => p.join(","))
        .join(" ");
      g.appendChild(
        svgEl("polygon", {
          points: pts,
          fill: meta.fill,
          stroke: COLORS.black,
          "stroke-width": strokeW,
          "stroke-linejoin": "round",
        })
      );
    } else {
      g.appendChild(
        svgEl("rect", {
          x: x0,
          y: y0,
          width: node.w,
          height: node.h,
          rx: node.h / 2,
          ry: node.h / 2,
          fill: meta.fill,
          stroke: COLORS.black,
          "stroke-width": strokeW,
        })
      );
    }

    const label = displayText == null ? node.text : displayText;
    g.appendChild(
      svgEl("text", {
        x: node.cx,
        y: node.cy,
        fill: meta.fg,
        "font-size": fontSize,
        "font-weight": 700,
        "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
        "text-anchor": "middle",
        "dominant-baseline": "central",
        textContent: label,
      })
    );

    if (clickable && onClick) {
      g.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(node.id);
      });
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(node.id);
        }
      });
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", "Reveal " + node.id);
    }

    parent.appendChild(g);
  }

  function drawGloss(parent, node, fontSize, text) {
    if (!text) return;
    parent.appendChild(
      svgEl("text", {
        x: node.cx,
        y: node.cy + node.h / 2 + 14,
        fill: COLORS.gloss,
        "font-size": fontSize,
        "font-weight": 500,
        "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
        "text-anchor": "middle",
        "dominant-baseline": "hanging",
        textContent: text,
      })
    );
  }

  function tokenMap(tokens) {
    const m = {};
    (tokens || []).forEach((t) => {
      m[t.id] = t;
    });
    return m;
  }

  /** Resolve layout id → token; tolerate pred2/pred role/id drift. */
  function resolveToken(byId, id, tokens) {
    if (id == null) return null;
    if (byId[id]) return byId[id];
    const list = tokens || [];
    const byRole = list.find((t) => t.role === id);
    if (byRole) return byRole;
    if (id === "pred2" && byId.pred) return byId.pred;
    if (id === "pred" && byId.pred2) return byId.pred2;
    return null;
  }


  function makeNode(tok, fontSize, bead) {
    if (!tok) {
      return { id: "_missing", text: "?", role: "noun", gloss_zh: "", gloss_en: "", w: 40, h: 40, cx: 0, cy: 0 };
    }
    // Size based on real Amis text so practice-mode hidden pills keep layout
    const sz = sizeFor(tok.text, tok.role, fontSize, bead);
    return {
      id: tok.id,
      text: tok.text,
      role: tok.role,
      gloss_zh: tok.gloss_zh,
      gloss_en: tok.gloss_en,
      w: sz.w,
      h: sz.h,
      _punctFont: sz._punctFont || null,
      _periodDot: !!sz._periodDot,
      cx: 0,
      cy: 0,
    };
  }

  function displayFor(tok, practice, revealed) {
    if (isPunctToken(tok)) return punctDisplay(tok.text);
    if (!practice) return tok.text;
    if (revealed && revealed.has(tok.id)) return tok.text;
    return "· · ·";
  }

  function glossFor(tok, practice, revealed) {
    if (isPunctToken(tok)) return "";
    const meta = ROLE_META[tok.role] || ROLE_META.pred;
    if (practice) {
      if (!(revealed && revealed.has(tok.id))) return "";
      return meta.label + " · " + (tok.gloss_zh || tok.gloss_en || "");
    }
    return meta.label + " · " + (tok.gloss_zh || tok.gloss_en || "");
  }

  function beadGloss(tok, practice, revealed) {
    if (isPunctToken(tok)) return "";
    if (practice && !(revealed && revealed.has(tok.id))) return "";
    return tok.gloss_zh || tok.gloss_en || "";
  }

  function renderMiniLegend(parent, cx, y) {
    const swatch = 16;
    const gap = 14;
    const fontSize = 11;
    const widths = LEGEND.map(([, lab]) => swatch + 6 + measureText(lab, fontSize));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (LEGEND.length - 1);
    let x = cx - total / 2;
    LEGEND.forEach(([col, lab], i) => {
      parent.appendChild(
        svgEl("rect", {
          x,
          y: y - swatch / 2,
          width: swatch,
          height: swatch,
          rx: swatch / 2,
          fill: col,
          stroke: COLORS.black,
          "stroke-width": 2,
        })
      );
      parent.appendChild(
        svgEl("text", {
          x: x + swatch + 5,
          y,
          fill: COLORS.text,
          "font-size": fontSize,
          "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
          "dominant-baseline": "central",
          textContent: lab,
        })
      );
      x += widths[i] + gap;
    });
  }

  /**
   * @param {HTMLElement} container
   * @param {object} sentence
   * @param {{ practice?: boolean, revealed?: Set<string>, onReveal?: (id:string)=>void }} options
   */
  function renderDiagram(container, sentence, options) {
    options = options || {};
    const practice = !!options.practice;
    const revealed = options.revealed || new Set();
    const onReveal = options.onReveal || null;

    container.innerHTML = "";

    const W = 900;
    const stroke = 4;
    const tokens = ensureTrailingPunct(expandTokens(sentence.tokens || []), sentence);
    const byId = tokenMap(tokens);

    // --- Measure wrapped beads first (affects SVG height) ---
    const beadFont = 16;
    const beadGlossFont = 11;
    const beadY0 = 88;
    const beadMaxW = W - 80;
    const beads = tokens.map((t) => makeNode(t, beadFont, true));
    const beadLayout = layoutBeadsWrapped(beads, beadY0, 10, beadMaxW, 108, sentence);
    beadLayout.rows.forEach((r) => {
      const dx = (W - r._width) / 2;
      r.forEach((n) => {
        n.cx += dx;
      });
    });

    const extraBeadH = beadLayout.height || 0;
    const mapRowPitch = 260;
    // Fit frame to content (same density as short sentences — no huge empty map).
    // Estimate map rows from beads; refine after wrap, then shrink H to content.
    let mapRowEstimate = Math.max(1, beadLayout.rowCount || 1);
    const mapTopPad = 56;
    const mapBottomPad = 140; // structure line + padding inside map
    const mapFooter = 90; // legend + footer below map
    function heightForMapRows(nRows) {
      const mapInner = mapTopPad + Math.max(0, nRows - 1) * mapRowPitch + mapBottomPad;
      return mapY0 + mapInner + mapFooter;
    }
    const mapY0 = 172 + extraBeadH;
    let H = heightForMapRows(mapRowEstimate);

    const svg = svgEl("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: "100%",
      height: "100%",
      role: "img",
      "aria-label": "Sentence map for " + sentence.amis,
      class: "sentence-diagram",
    });

    // Frame + mint chrome
    const frameRect = svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: COLORS.frame });
    svg.appendChild(frameRect);
    const mintRect = svgEl("rect", {
      x: 16,
      y: 16,
      width: W - 32,
      height: H - 32,
      rx: 22,
      fill: COLORS.mint,
    });
    svg.appendChild(mintRect);

    const layer = svgEl("g", { class: "diagram-content" });
    svg.appendChild(layer);

    // Section labels
    const labelAttrs = {
      fill: COLORS.footer,
      "font-size": 12,
      "font-weight": 700,
      "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
      "text-anchor": "middle",
    };
    layer.appendChild(
      svgEl("text", Object.assign({ x: W / 2, y: 42, textContent: "說話順序" }, labelAttrs))
    );
    layer.appendChild(
      svgEl(
        "text",
        Object.assign(
          { x: W / 2, y: mapY0 - 14, textContent: "依附關係（謂語當中心，不是英文 SVO）" },
          labelAttrs
        )
      )
    );

    // --- Bead rows: connect adjacent word beads only (never through punctuation) ---
    beadLayout.rows.forEach((r) => {
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i];
        const b = r[i + 1];
        if (isPunctToken(a) || isPunctToken(b)) continue;
        thickLine(layer, a.cx, a.cy, b.cx, b.cy, 3, COLORS.black);
      }
    });
    beads.forEach((n) => {
      const tok = byId[n.id];
      const clickable = practice && tok && !isPunctToken(tok);
      drawShape(
        layer,
        n,
        beadFont,
        3.5,
        displayFor(tok, practice, revealed),
        clickable,
        onReveal
      );
      drawGloss(layer, n, beadGlossFont, beadGloss(tok, practice, revealed));
    });

    // --- Map box ---
    const mapBox = { x0: 40, y0: mapY0, x1: W - 40, y1: H - 90 };
    const bw = mapBox.x1 - mapBox.x0;
    const bh = mapBox.y1 - mapBox.y0;

    const mapRect = svgEl("rect", {
      x: mapBox.x0,
      y: mapBox.y0,
      width: bw,
      height: bh,
      rx: 14,
      fill: COLORS.map,
      stroke: COLORS.black,
      "stroke-width": stroke,
    });
    layer.appendChild(mapRect);

    const layout = sentence.layout || {};
    const groups = layout.groups || [];
    const hangs = layout.hangs || {};
    const plusBetween = !!layout.plus_between_groups;
    const structure = layout.structure || "";

    const nodeFont = 16;
    const glossFont = 11;
    const allNodes = {};
    const expandedGroups = groups.map((gids) => expandLayoutIds(gids, tokens));
    const expandedHangs = {};
    Object.keys(hangs).forEach((parent) => {
      expandLayoutIds([parent], tokens).forEach((expandedParent) => {
        expandedHangs[expandedParent] = expandLayoutIds(hangs[parent], tokens);
      });
    });
    const groupsNodes = expandedGroups.map((gids) =>
      gids
        .map((id) => {
          const tok = resolveToken(byId, id, tokens);
          if (!tok) return null;
          const n = makeNode(tok, nodeFont, false);
          allNodes[tok.id] = n;
          return n;
        })
        .filter(Boolean)
    ).filter((g) => g.length);
    // Fallback: if layout ids were all broken, show every token in order
    if (!groupsNodes.length && tokens.length) {
      groupsNodes.push(
        tokens.map((tok) => {
          const n = makeNode(tok, nodeFont, false);
          allNodes[tok.id] = n;
          return n;
        })
      );
    }
    const hangNodes = {};
    Object.keys(expandedHangs).forEach((parent) => {
      const kids = (expandedHangs[parent] || [])
        .map((id) => {
          const tok = resolveToken(byId, id, tokens);
          if (!tok) return null;
          const n = makeNode(tok, nodeFont, false);
          allNodes[tok.id] = n;
          return n;
        })
        .filter(Boolean);
      const pTok = resolveToken(byId, parent, tokens);
      if (pTok && kids.length) hangNodes[pTok.id] = kids;
    });

    const tight = new Set(
      Object.values(allNodes)
        .filter((n) => n.role === "case")
        .map((n) => n.id)
    );

    function chainEdges(gnodes) {
      for (let i = 0; i < gnodes.length - 1; i++) {
        const a = gnodes[i];
        const b = gnodes[i + 1];
        // No connector into/out of punctuation (e.g. wawa / kaemangay, … .)
        if (isPunctToken(a) || isPunctToken(b)) continue;
        thickLine(layer, a.cx, a.cy, b.cx, b.cy, stroke, COLORS.black);
      }
    }

    function drawPredTicks(gnodes) {
      for (let i = 0; i < gnodes.length; i++) {
        const n = gnodes[i];
        if ((n.role === "pred" || n.role === "pred2") && i + 1 < gnodes.length) {
          let j = i + 1;
          while (j < gnodes.length && isPunctToken(gnodes[j])) j += 1;
          if (j >= gnodes.length) break;
          const nxt = gnodes[j];
          if (nxt.role === "case" || nxt.role === "pronoun") {
            const mx = (n.cx + n.w / 2 + nxt.cx - nxt.w / 2) / 2;
            drawTick(layer, mx, n.cy, 14, stroke, COLORS.black);
          }
          break;
        }
      }
    }

    function layoutHangsForParents(parentIds, yHang) {
      parentIds.forEach((parent) => {
        const hlist = hangNodes[parent];
        if (!hlist || !hlist.length) return;
        const p = allNodes[parent];
        if (!p) return;
        layoutSequence(hlist, yHang, 30, tight);
        const hangW =
          hlist[hlist.length - 1].cx +
          hlist[hlist.length - 1].w / 2 -
          (hlist[0].cx - hlist[0].w / 2);
        const desired = p.cx + 10;
        const minStart = mapBox.x0 + 40;
        const maxStart = mapBox.x1 - 40 - hangW;
        const hs = Math.max(minStart, Math.min(desired, maxStart));
        const currentStart = hlist[0].cx - hlist[0].w / 2;
        shiftNodes(hlist, hs - currentStart);
        thickLine(layer, p.cx, p.cy, hlist[0].cx, hlist[0].cy, stroke, COLORS.black);
        chainEdges(hlist);
      });
    }

        // Sentence partitions, then width-wrap so long single sentences don't clip.
    const mapMaxW = bw - 48;
    const sentParts = partitionMapNodesBySentence(groupsNodes, sentence);
    const wrappedMapRows = [];
    sentParts.forEach((part) => {
      if (!part.length) return;
      wrapNodesToWidth(part, 36, mapMaxW).forEach((r) => wrappedMapRows.push(r));
    });
    if (!wrappedMapRows.length) {
      groupsNodes.forEach((gn) => {
        if (gn.length) wrappedMapRows.push(gn);
      });
    }

    let mapYCursor = mapBox.y0 + 56;
    const hangStride = 120; // main → hang band
    // Clear long role glosses under map beads ("第二子句謂語 · …")
    const glossClearance = 72;
    const rowGapAfter = 96;
    wrappedMapRows.forEach((rowNodes) => {
      if (!rowNodes.length) return;
      const yMain = mapYCursor;
      const parentIds = rowNodes
        .filter((n) => !isPunctToken(n))
        .map((n) => n.id)
        .filter((id) => hangNodes[id]);
      const hasHangs = parentIds.length > 0;
      const yHang = yMain + hangStride;
      layoutSequence(rowNodes, yMain, 36, tight);
      const chainW =
        rowNodes[rowNodes.length - 1].cx +
        rowNodes[rowNodes.length - 1].w / 2 -
        (rowNodes[0].cx - rowNodes[0].w / 2);
      const startX = mapBox.x0 + (bw - chainW) / 2;
      const curStart = rowNodes[0].cx - rowNodes[0].w / 2;
      shiftNodes(rowNodes, startX - curStart);
      chainEdges(rowNodes);
      drawPredTicks(rowNodes);
      if (hasHangs) layoutHangsForParents(parentIds, yHang);
      // Next row starts below this row's lowest gloss band
      const bandBottom = (hasHangs ? yHang : yMain) + glossClearance;
      mapYCursor = bandBottom + rowGapAfter;
    });

    // Fit frame to the laid-out map content (no empty gray, no clipped rows)
    {
      const contentBottom = mapYCursor + 24;
      const needed = contentBottom + mapFooter;
      H = Math.max(needed, mapBox.y0 + 220 + mapFooter);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      frameRect.setAttribute("height", String(H));
      mintRect.setAttribute("height", String(H - 32));
      mapBox.y1 = H - mapFooter;
      mapRect.setAttribute("height", String(mapBox.y1 - mapBox.y0));
    }

    // Place punct tokens present in the expanded list but missing from layout ids
    // (e.g. hand-tuned hang rows that omitted trailing period). Anchor to previous
    // mapped token — for Adadaay…mako. that is mako on the hang row.
    {
      let prevNode = null;
      tokens.forEach((tok) => {
        if (!tok) return;
        if (allNodes[tok.id]) {
          prevNode = allNodes[tok.id];
          return;
        }
        if (!isPunctToken(tok)) return;
        if (!prevNode) return;
        const n = makeNode(tok, nodeFont, false);
        const gap = 12;
        n.cx = prevNode.cx + prevNode.w / 2 + gap + n.w / 2;
        n.cy = prevNode.cy;
        allNodes[tok.id] = n;
        prevNode = n;
      });
    }

    Object.values(allNodes).forEach((n) => {
      const tok = byId[n.id];
      const clickable = practice && tok && !isPunctToken(tok);
      drawShape(
        layer,
        n,
        nodeFont,
        stroke,
        displayFor(tok, practice, revealed),
        clickable,
        onReveal
      );
      drawGloss(layer, n, glossFont, glossFor(tok, practice, revealed));
    });

    if (structure && !practice) {
      layer.appendChild(
        svgEl("text", {
          x: (mapBox.x0 + mapBox.x1) / 2,
          y: mapBox.y1 - 22,
          fill: COLORS.gloss,
          "font-size": 12,
          "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
          "text-anchor": "middle",
          textContent: structure,
        })
      );
    } else if (practice) {
      layer.appendChild(
        svgEl("text", {
          x: (mapBox.x0 + mapBox.x1) / 2,
          y: mapBox.y1 - 22,
          fill: COLORS.gloss,
          "font-size": 12,
          "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
          "text-anchor": "middle",
          textContent: "點彩珠／色塊看阿美語",
        })
      );
    }

    renderMiniLegend(layer, W / 2, H - 58);

    layer.appendChild(
      svgEl("text", {
        x: W / 2,
        y: H - 28,
        fill: COLORS.footer,
        "font-size": 11,
        "font-family": '"Segoe UI","Helvetica Neue",Arial,"Noto Sans","Noto Sans CJK TC","Noto Sans TC","PingFang TC",sans-serif',
        "text-anchor": "middle",
        textContent: FOOTER,
      })
    );

    container.appendChild(svg);
  }

  global.renderDiagram = renderDiagram;
  global.DIAGRAM_COLORS = COLORS;
  global.DIAGRAM_PUNCT_RE = PUNCT_RE;
  global.isPunctText = isPunctText;
  global.splitTokenKeepPunct = splitTokenKeepPunct;
  global.expandTokens = expandTokens;
  global.ensureTrailingPunct = ensureTrailingPunct;
  global.punctDisplay = punctDisplay;
  global.isPeriodPunct = isPeriodPunct;
  global.DIAGRAM_ROLE_META = ROLE_META;
})(typeof window !== "undefined" ? window : globalThis);
