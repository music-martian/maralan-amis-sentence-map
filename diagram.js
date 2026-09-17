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
      if (ch === "’" || ch === "'" || ch === "‘" || ch === "ʼ") w += fontSize * 0.22;
      else if (code < 0x80 || (code >= 0xa0 && code <= 0x024f)) w += fontSize * 0.58;
      else w += fontSize * 0.95;
    }
    return w;
  }

  function sizeFor(text, role, fontSize, bead) {
    const meta = ROLE_META[role] || ROLE_META.pred;
    const tw = measureText(text, fontSize);
    const th = fontSize;
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
    for (const ch of String(amis)) {
      buf += ch;
      if (/[.!?。！？]/.test(ch)) {
        const t = buf.trim();
        if (t) parts.push(t);
        buf = "";
      }
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts.length ? parts : [String(amis).trim()];
  }

  function wordsInAmisSentence(sent) {
    return String(sent)
      .replace(/[.!?。！？]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  /** Group bead nodes by sentence boundaries in sentence.amis (yellow-line splits). */
  function groupBeadsBySentence(nodes, sentence) {
    const sents = splitAmisSentences((sentence && sentence.amis) || "");
    if (!nodes.length) return [];
    if (sents.length <= 1) return [nodes.slice()];
    const groups = [];
    let idx = 0;
    sents.forEach((sent) => {
      const n = wordsInAmisSentence(sent).length;
      if (n <= 0) return;
      const slice = nodes.slice(idx, idx + n);
      if (slice.length) groups.push(slice);
      idx += n;
    });
    if (idx < nodes.length) {
      const rest = nodes.slice(idx);
      if (groups.length) groups[groups.length - 1] = groups[groups.length - 1].concat(rest);
      else groups.push(rest);
    }
    return groups.length ? groups : [nodes.slice()];
  }

  /**
   * Layout beads: exactly one row per Amis sentence (no mid-sentence wrap).
   * Only split at sentence endings in sentence.amis (. ! ? 。！？).
   */
  function layoutBeadsWrapped(nodes, y0, gap, maxWidth, rowGap, sentence) {
    rowGap = rowGap || 56;
    if (!nodes.length) return { width: 0, height: 0, rows: [], rowCount: 0, rowGap };
    const groups = groupBeadsBySentence(nodes, sentence || {});
    const rows = [];
    let y = y0;
    let maxRowW = 0;

    groups.forEach((group) => {
      if (!group.length) return;
      let x = 0;
      group.forEach((n, i) => {
        if (i) x += gap;
        n.cx = x + n.w / 2;
        n.cy = y;
        n._row = rows.length;
        x += n.w;
      });
      group._width = x;
      maxRowW = Math.max(maxRowW, x);
      rows.push(group);
      y += rowGap;
    });

    return {
      width: maxRowW,
      height: rows.length ? (rows.length - 1) * rowGap : 0,
      rows,
      rowCount: rows.length,
      rowGap,
    };
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
    const meta = ROLE_META[node.role] || ROLE_META.pred;
    const g = svgEl("g", {
      class: "token-shape" + (clickable ? " clickable" : ""),
      "data-token-id": node.id,
      style: clickable ? "cursor:pointer" : null,
    });

    const x0 = node.cx - node.w / 2;
    const y0 = node.cy - node.h / 2;

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

  function tokenMap(sentence) {
    const m = {};
    sentence.tokens.forEach((t) => {
      m[t.id] = t;
    });
    return m;
  }

  function makeNode(tok, fontSize, bead) {
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
      cx: 0,
      cy: 0,
    };
  }

  function displayFor(tok, practice, revealed) {
    if (!practice) return tok.text;
    if (revealed && revealed.has(tok.id)) return tok.text;
    return "· · ·";
  }

  function glossFor(tok, practice, revealed) {
    const meta = ROLE_META[tok.role] || ROLE_META.pred;
    if (practice) {
      if (!(revealed && revealed.has(tok.id))) return "";
      return meta.label + " · " + (tok.gloss_zh || tok.gloss_en || "");
    }
    return meta.label + " · " + (tok.gloss_zh || tok.gloss_en || "");
  }

  function beadGloss(tok, practice, revealed) {
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
    const byId = tokenMap(sentence);

    // --- Measure wrapped beads first (affects SVG height) ---
    const beadFont = 16;
    const beadGlossFont = 11;
    const beadY0 = 88;
    const beadMaxW = W - 80;
    const beads = sentence.tokens.map((t) => makeNode(t, beadFont, true));
    const beadLayout = layoutBeadsWrapped(beads, beadY0, 10, beadMaxW, 58, sentence);
    beadLayout.rows.forEach((r) => {
      const dx = (W - r._width) / 2;
      r.forEach((n) => {
        n.cx += dx;
      });
    });

    const extraBeadH = beadLayout.height || 0;
    const H = 680 + extraBeadH;
    const mapY0 = 172 + extraBeadH;

    const svg = svgEl("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: "100%",
      height: "100%",
      role: "img",
      "aria-label": "Sentence map for " + sentence.amis,
      class: "sentence-diagram",
    });

    // Frame + mint chrome
    svg.appendChild(svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: COLORS.frame }));
    svg.appendChild(
      svgEl("rect", {
        x: 16,
        y: 16,
        width: W - 32,
        height: H - 32,
        rx: 22,
        fill: COLORS.mint,
      })
    );

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

    // --- Bead rows (one row per sentence; wrap within sentence if needed) ---
    beadLayout.rows.forEach((r) => {
      if (r.length >= 2) {
        thickLine(layer, r[0].cx, r[0].cy, r[r.length - 1].cx, r[0].cy, 3, COLORS.black);
      }
    });
    beads.forEach((n) => {
      const tok = byId[n.id];
      drawShape(
        layer,
        n,
        beadFont,
        3.5,
        displayFor(tok, practice, revealed),
        practice,
        onReveal
      );
      drawGloss(layer, n, beadGlossFont, beadGloss(tok, practice, revealed));
    });

    // --- Map box ---
    const mapBox = { x0: 40, y0: mapY0, x1: W - 40, y1: H - 90 };
    const bw = mapBox.x1 - mapBox.x0;
    const bh = mapBox.y1 - mapBox.y0;

    layer.appendChild(
      svgEl("rect", {
        x: mapBox.x0,
        y: mapBox.y0,
        width: bw,
        height: bh,
        rx: 14,
        fill: COLORS.map,
        stroke: COLORS.black,
        "stroke-width": stroke,
      })
    );

    const layout = sentence.layout || {};
    const groups = layout.groups || [];
    const hangs = layout.hangs || {};
    const plusBetween = !!layout.plus_between_groups;
    const structure = layout.structure || "";

    const nodeFont = 16;
    const glossFont = 11;
    const allNodes = {};
    const groupsNodes = groups.map((gids) =>
      gids.map((id) => {
        const n = makeNode(byId[id], nodeFont, false);
        allNodes[id] = n;
        return n;
      })
    );
    const hangNodes = {};
    Object.keys(hangs).forEach((parent) => {
      hangNodes[parent] = hangs[parent].map((id) => {
        const n = makeNode(byId[id], nodeFont, false);
        allNodes[id] = n;
        return n;
      });
    });

    const tight = new Set(
      Object.values(allNodes)
        .filter((n) => n.role === "case")
        .map((n) => n.id)
    );

    const yMain = mapBox.y0 + bh * 0.36;
    const yHang = mapBox.y0 + bh * 0.68;

    const gwidths = groupsNodes.map((gn) => layoutSequence(gn, yMain, 36, tight));
    const plusSpace = plusBetween && groupsNodes.length === 2 ? 90 : 0;
    const total = gwidths.reduce((a, b) => a + b, 0) + plusSpace;
    let cursor = mapBox.x0 + (bw - total) / 2;
    let plusXy = null;

    groupsNodes.forEach((gnodes, i) => {
      layoutSequence(gnodes, yMain, 36, tight);
      shiftNodes(gnodes, cursor);
      cursor += gwidths[i];
      if (plusBetween && i === 0 && groupsNodes.length > 1) {
        plusXy = { x: cursor + plusSpace / 2, y: yMain };
        cursor += plusSpace;
      }
    });

    Object.keys(hangNodes).forEach((parent) => {
      const hlist = hangNodes[parent];
      const p = allNodes[parent];
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
    });

    function chainEdges(gnodes) {
      for (let i = 0; i < gnodes.length - 1; i++) {
        const a = gnodes[i];
        const b = gnodes[i + 1];
        thickLine(layer, a.cx, a.cy, b.cx, b.cy, stroke, COLORS.black);
      }
    }

    groupsNodes.forEach(chainEdges);

    // Vertical tick between predicate and nominative
    groupsNodes.forEach((gnodes) => {
      for (let i = 0; i < gnodes.length; i++) {
        const n = gnodes[i];
        if ((n.role === "pred" || n.role === "pred2") && i + 1 < gnodes.length) {
          const nxt = gnodes[i + 1];
          if (nxt.role === "case" || nxt.role === "pronoun") {
            const mx = (n.cx + n.w / 2 + nxt.cx - nxt.w / 2) / 2;
            drawTick(layer, mx, n.cy, 14, stroke, COLORS.black);
          }
          break;
        }
      }
    });

    if (plusXy && groupsNodes.length === 2) {
      const left = groupsNodes[0][groupsNodes[0].length - 1];
      const right = groupsNodes[1][0];
      thickLine(layer, left.cx, left.cy, plusXy.x, plusXy.y, stroke, COLORS.black);
      thickLine(layer, plusXy.x, plusXy.y, right.cx, right.cy, stroke, COLORS.black);
      drawPlus(layer, plusXy.x, plusXy.y, 12, stroke, COLORS.black, COLORS.map);
    }

    Object.keys(hangNodes).forEach((parent) => {
      const p = allNodes[parent];
      const hlist = hangNodes[parent];
      thickLine(layer, p.cx, p.cy, hlist[0].cx, hlist[0].cy, stroke, COLORS.black);
      chainEdges(hlist);
    });

    Object.values(allNodes).forEach((n) => {
      const tok = byId[n.id];
      drawShape(
        layer,
        n,
        nodeFont,
        stroke,
        displayFor(tok, practice, revealed),
        practice,
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
  global.DIAGRAM_ROLE_META = ROLE_META;
})(typeof window !== "undefined" ? window : globalThis);
