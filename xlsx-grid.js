(() => {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

  function parseXml(text) {
    return new DOMParser().parseFromString(text, "application/xml");
  }

  function colToNumber(col) {
    let n = 0;
    for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  }

  function parseCellRef(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    return { col: colToNumber(m[1]), row: Number(m[2]) };
  }

  function parseRange(ref) {
    const [a, b = a] = ref.split(":");
    const p1 = parseCellRef(a);
    const p2 = parseCellRef(b);
    return { c1: p1.col, r1: p1.row, c2: p2.col, r2: p2.row };
  }

  function normalizePath(base, target) {
    if (target.startsWith("/")) return target.slice(1);
    const parts = `${base}/${target}`.split("/");
    const out = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  }

  function themeColor(themeDoc, index) {
    const scheme = themeDoc?.getElementsByTagName("a:clrScheme")?.[0];
    if (!scheme) return null;
    const children = [...scheme.children];
    const item = children[index];
    if (!item?.firstElementChild) return null;
    return item.firstElementChild.getAttribute("val") || item.firstElementChild.getAttribute("lastClr");
  }

  function applyTint(hex, tint) {
    if (!hex) return null;
    const value = hex.replace(/^FF/, "").replace(/^#/, "");
    if (value.length !== 6) return value;
    const t = Number(tint || 0);
    const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
    const out = rgb.map((v) => t < 0 ? Math.round(v * (1 + t)) : Math.round(v + (255 - v) * t));
    return out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  function getFillColor(fill, themeDoc) {
    const pattern = fill?.getElementsByTagNameNS(NS, "patternFill")?.[0];
    if (!pattern || pattern.getAttribute("patternType") !== "solid") return "FFFFFF";
    const fg = pattern.getElementsByTagNameNS(NS, "fgColor")?.[0];
    if (!fg) return "FFFFFF";
    if (fg.getAttribute("rgb")) return fg.getAttribute("rgb").replace(/^FF/, "");
    if (fg.getAttribute("theme")) {
      const base = themeColor(themeDoc, Number(fg.getAttribute("theme"))) || "FFFFFF";
      return applyTint(base, fg.getAttribute("tint"));
    }
    return "FFFFFF";
  }

  function isWhite(hex) {
    const h = (hex || "FFFFFF").toUpperCase();
    if (h === "FFFFFF" || h === "FFF" || h === "") return true;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return r >= 245 && g >= 245 && b >= 245;
  }

  function cellKey(r, c) { return `${r},${c}`; }

  function chooseSheet(workbookDoc, relsDoc) {
    const sheets = [...workbookDoc.getElementsByTagNameNS(NS, "sheet")];
    const first = sheets[0];
    const relId = first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = [...relsDoc.getElementsByTagNameNS(REL_NS, "Relationship")].find((x) => x.getAttribute("Id") === relId);
    return { name: first.getAttribute("name"), target: normalizePath("xl", rel.getAttribute("Target")) };
  }

  async function parseWorkbook(file) {
    if (!window.JSZip) throw new Error("JSZip 라이브러리를 불러오지 못했습니다.");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const readText = async (name, optional = false) => {
      const entry = zip.file(name);
      if (!entry) {
        if (optional) return null;
        throw new Error(`${name} 파일을 찾을 수 없습니다.`);
      }
      return entry.async("text");
    };

    const [workbookText, relsText, stylesText, sharedText, themeText] = await Promise.all([
      readText("xl/workbook.xml"),
      readText("xl/_rels/workbook.xml.rels"),
      readText("xl/styles.xml"),
      readText("xl/sharedStrings.xml", true),
      readText("xl/theme/theme1.xml", true)
    ]);
    const workbookDoc = parseXml(workbookText);
    const relsDoc = parseXml(relsText);
    const stylesDoc = parseXml(stylesText);
    const sharedDoc = sharedText ? parseXml(sharedText) : null;
    const themeDoc = themeText ? parseXml(themeText) : null;
    const sheetInfo = chooseSheet(workbookDoc, relsDoc);
    const sheetDoc = parseXml(await readText(sheetInfo.target));

    const sharedStrings = sharedDoc ? [...sharedDoc.getElementsByTagNameNS(NS, "si")].map((si) =>
      [...si.getElementsByTagNameNS(NS, "t")].map((t) => t.textContent || "").join("")
    ) : [];

    const fills = [...stylesDoc.getElementsByTagNameNS(NS, "fills")[0].children].map((fill) => getFillColor(fill, themeDoc));
    const xfs = [...stylesDoc.getElementsByTagNameNS(NS, "cellXfs")[0].children].map((xf) => ({
      fillId: Number(xf.getAttribute("fillId") || 0)
    }));

    const dimension = sheetDoc.getElementsByTagNameNS(NS, "dimension")[0]?.getAttribute("ref") || "A1:A1";
    const dim = parseRange(dimension);
    const rows = dim.r2;
    const cols = dim.c2;
    const cellMap = new Map();

    for (const cell of sheetDoc.getElementsByTagNameNS(NS, "c")) {
      const ref = cell.getAttribute("r");
      const pos = parseCellRef(ref);
      const styleId = Number(cell.getAttribute("s") || 0);
      const type = cell.getAttribute("t");
      const v = cell.getElementsByTagNameNS(NS, "v")[0];
      let value = v?.textContent || "";
      if (type === "s" && value !== "") value = sharedStrings[Number(value)] || "";
      if (type === "inlineStr") value = cell.getElementsByTagNameNS(NS, "t")[0]?.textContent || "";
      const fillId = xfs[styleId]?.fillId || 0;
      cellMap.set(cellKey(pos.row, pos.col), { value: String(value).trim(), styleId, fillId, color: fills[fillId] || "FFFFFF" });
    }

    const mergedRanges = [...sheetDoc.getElementsByTagNameNS(NS, "mergeCell")].map((m) => parseRange(m.getAttribute("ref")));
    const occupiedByDestination = new Map();
    const blocked = Array.from({ length: rows + 1 }, () => new Uint8Array(cols + 1));
    const fillGrid = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill("FFFFFF"));
    const destinationsById = new Map();

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const cell = cellMap.get(cellKey(r, c));
        if (cell) fillGrid[r][c] = cell.color;
        if (cell && !isWhite(cell.color)) blocked[r][c] = 1;
      }
    }

    for (const range of mergedRanges) {
      const top = cellMap.get(cellKey(range.r1, range.c1));
      const value = (top?.value || "").trim();
      const color = top?.color || fillGrid[range.r1][range.c1] || "FFFFFF";
      for (let r = range.r1; r <= range.r2; r++) {
        for (let c = range.c1; c <= range.c2; c++) {
          fillGrid[r][c] = color;
          if (!isWhite(color) || value) blocked[r][c] = 1;
        }
      }
      if (!value || isWhite(color)) continue;
      const id = value.replace(/\s+/g, " ");
      if (!destinationsById.has(id)) {
        destinationsById.set(id, { id, booth: id, name: id, category: "부스", keywords: [], type: "booth", shapes: [], entranceCandidates: [] });
        occupiedByDestination.set(id, new Set());
      }
      destinationsById.get(id).shapes.push({ ...range, color });
      const set = occupiedByDestination.get(id);
      for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) set.add(cellKey(r, c));
    }

    const walkableRows = [];
    let walkableCount = 0;
    for (let r = 1; r <= rows; r++) {
      let line = "";
      for (let c = 1; c <= cols; c++) {
        const walkable = !blocked[r][c] && isWhite(fillGrid[r][c]);
        line += walkable ? "1" : "0";
        if (walkable) walkableCount++;
      }
      walkableRows.push(line);
    }

    const dirs = [
      { dr: -1, dc: 0, side: "top" }, { dr: 1, dc: 0, side: "bottom" },
      { dr: 0, dc: -1, side: "left" }, { dr: 0, dc: 1, side: "right" }
    ];
    const isWalkable = (r, c) => r >= 1 && r <= rows && c >= 1 && c <= cols && walkableRows[r - 1][c - 1] === "1";

    for (const item of destinationsById.values()) {
      const set = occupiedByDestination.get(item.id);
      const candidates = new Map();
      for (const key of set) {
        const [r, c] = key.split(",").map(Number);
        for (const d of dirs) {
          const nr = r + d.dr, nc = c + d.dc;
          if (!isWalkable(nr, nc)) continue;
          const ck = cellKey(nr, nc);
          if (!candidates.has(ck)) candidates.set(ck, { row: nr, col: nc, side: d.side, boothRow: r, boothCol: c });
        }
      }
      item.entranceCandidates = [...candidates.values()];
    }

    const destinations = [...destinationsById.values()].sort((a, b) => a.id.localeCompare(b.id, "ko", { numeric: true }));
    const noEntrance = destinations.filter((d) => !d.entranceCandidates.length).map((d) => d.id);

    const runs = [];
    for (let r = 1; r <= rows; r++) {
      let start = 1;
      let color = fillGrid[r][1] || "FFFFFF";
      for (let c = 2; c <= cols + 1; c++) {
        const next = c <= cols ? (fillGrid[r][c] || "FFFFFF") : null;
        if (next !== color) {
          if (!isWhite(color)) runs.push({ row: r, c1: start, c2: c - 1, color });
          start = c;
          color = next;
        }
      }
    }

    return {
      version: 1,
      sourceName: file.name,
      sheetName: sheetInfo.name,
      rows,
      cols,
      cellMeters: 1,
      walkableRows,
      destinations,
      runs,
      stats: {
        boothCount: destinations.length,
        walkableCount,
        noEntrance,
        duplicateShapeCount: destinations.filter((d) => d.shapes.length > 1).length
      }
    };
  }

  window.XlsxGridParser = { parseWorkbook };
})();
