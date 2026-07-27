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
    const item = [...scheme.children][index];
    if (!item?.firstElementChild) return null;
    return item.firstElementChild.getAttribute("val") || item.firstElementChild.getAttribute("lastClr");
  }

  function applyTint(hex, tint) {
    if (!hex) return null;
    const value = hex.replace(/^FF/, "").replace(/^#/, "");
    if (value.length !== 6) return value;
    const t = Number(tint || 0);
    const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
    return rgb.map((v) => t < 0 ? Math.round(v * (1 + t)) : Math.round(v + (255 - v) * t))
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("").toUpperCase();
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
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return r >= 245 && g >= 245 && b >= 245;
  }

  function sameColor(a, b) {
    return String(a || "FFFFFF").toUpperCase() === String(b || "FFFFFF").toUpperCase();
  }

  function cellKey(r, c) { return `${r},${c}`; }

  function chooseSheet(workbookDoc, relsDoc) {
    const sheets = [...workbookDoc.getElementsByTagNameNS(NS, "sheet")];
    const first = sheets[0];
    const relId = first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = [...relsDoc.getElementsByTagNameNS(REL_NS, "Relationship")]
      .find((x) => x.getAttribute("Id") === relId);
    return { name: first.getAttribute("name"), target: normalizePath("xl", rel.getAttribute("Target")) };
  }

  function parseBorderSide(border, sideName) {
    const side = border?.getElementsByTagNameNS(NS, sideName)?.[0];
    const style = side?.getAttribute("style") || "";
    return style && style !== "none" ? style : "";
  }

  function compressCellsToShapes(cells, color) {
    const byRow = new Map();
    for (const [r, c] of cells) {
      if (!byRow.has(r)) byRow.set(r, []);
      byRow.get(r).push(c);
    }
    const shapes = [];
    for (const [r, cols] of byRow.entries()) {
      cols.sort((a, b) => a - b);
      let start = cols[0];
      let prev = cols[0];
      for (let i = 1; i <= cols.length; i++) {
        const current = cols[i];
        if (i < cols.length && current === prev + 1) {
          prev = current;
          continue;
        }
        shapes.push({ r1: r, r2: r, c1: start, c2: prev, color });
        start = current;
        prev = current;
      }
    }
    return shapes;
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

    const sharedStrings = sharedDoc
      ? [...sharedDoc.getElementsByTagNameNS(NS, "si")].map((si) =>
          [...si.getElementsByTagNameNS(NS, "t")].map((t) => t.textContent || "").join(""))
      : [];

    const fillsNode = stylesDoc.getElementsByTagNameNS(NS, "fills")?.[0];
    const bordersNode = stylesDoc.getElementsByTagNameNS(NS, "borders")?.[0];
    const xfsNode = stylesDoc.getElementsByTagNameNS(NS, "cellXfs")?.[0];
    const fills = fillsNode ? [...fillsNode.children].map((fill) => getFillColor(fill, themeDoc)) : ["FFFFFF"];
    const borders = bordersNode ? [...bordersNode.children].map((border) => ({
      top: parseBorderSide(border, "top"),
      right: parseBorderSide(border, "right"),
      bottom: parseBorderSide(border, "bottom"),
      left: parseBorderSide(border, "left")
    })) : [{ top: "", right: "", bottom: "", left: "" }];
    const xfs = xfsNode ? [...xfsNode.children].map((xf) => ({
      fillId: Number(xf.getAttribute("fillId") || 0),
      borderId: Number(xf.getAttribute("borderId") || 0)
    })) : [{ fillId: 0, borderId: 0 }];

    const dimension = sheetDoc.getElementsByTagNameNS(NS, "dimension")?.[0]?.getAttribute("ref") || "A1:A1";
    const dim = parseRange(dimension);
    const rows = dim.r2;
    const cols = dim.c2;
    const cellMap = new Map();

    for (const cell of sheetDoc.getElementsByTagNameNS(NS, "c")) {
      const ref = cell.getAttribute("r");
      if (!ref) continue;
      const pos = parseCellRef(ref);
      const styleId = Number(cell.getAttribute("s") || 0);
      const type = cell.getAttribute("t");
      const v = cell.getElementsByTagNameNS(NS, "v")?.[0];
      let value = v?.textContent || "";
      if (type === "s" && value !== "") value = sharedStrings[Number(value)] || "";
      if (type === "inlineStr") value = cell.getElementsByTagNameNS(NS, "t")?.[0]?.textContent || "";
      const style = xfs[styleId] || xfs[0];
      cellMap.set(cellKey(pos.row, pos.col), {
        value: String(value).trim(),
        styleId,
        color: fills[style.fillId] || "FFFFFF",
        border: borders[style.borderId] || borders[0]
      });
    }

    const mergedRanges = [...sheetDoc.getElementsByTagNameNS(NS, "mergeCell")]
      .map((m) => parseRange(m.getAttribute("ref")));
    const mergedByCell = new Map();
    const mergedTopLeft = new Map();
    for (const range of mergedRanges) {
      const topKey = cellKey(range.r1, range.c1);
      const top = cellMap.get(topKey) || { value: "", color: "FFFFFF", border: borders[0] };
      mergedTopLeft.set(topKey, range);
      for (let r = range.r1; r <= range.r2; r++) {
        for (let c = range.c1; c <= range.c2; c++) {
          mergedByCell.set(cellKey(r, c), range);
          const key = cellKey(r, c);
          const original = cellMap.get(key) || {};
          cellMap.set(key, {
            value: r === range.r1 && c === range.c1 ? top.value : "",
            color: original.color && !isWhite(original.color) ? original.color : top.color,
            border: original.border || top.border || borders[0],
            mergedRange: range
          });
        }
      }
    }

    const fillGrid = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill("FFFFFF"));
    const borderGrid = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(null));
    const valueGrid = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(""));
    const blocked = Array.from({ length: rows + 1 }, () => new Uint8Array(cols + 1));

    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const cell = cellMap.get(cellKey(r, c));
        if (!cell) continue;
        fillGrid[r][c] = cell.color || "FFFFFF";
        borderGrid[r][c] = cell.border || borders[0];
        valueGrid[r][c] = cell.value || "";
        if (!isWhite(fillGrid[r][c])) blocked[r][c] = 1;
      }
    }

    const insideSameMergedRange = (r1, c1, r2, c2) => {
      const a = mergedByCell.get(cellKey(r1, c1));
      const b = mergedByCell.get(cellKey(r2, c2));
      return !!a && a === b;
    };

    const boundaryExists = (r1, c1, r2, c2) => {
      if (insideSameMergedRange(r1, c1, r2, c2)) return false;
      const a = borderGrid[r1]?.[c1] || borders[0];
      const b = borderGrid[r2]?.[c2] || borders[0];
      if (r2 === r1 - 1) return !!(a.top || b.bottom);
      if (r2 === r1 + 1) return !!(a.bottom || b.top);
      if (c2 === c1 - 1) return !!(a.left || b.right);
      if (c2 === c1 + 1) return !!(a.right || b.left);
      return true;
    };

    // 색상 + 외곽선으로 부스 영역을 만든다.
    // 같은 색상이고 두 셀 사이에 테두리가 없을 때만 같은 영역으로 연결한다.
    const coloredUnvisited = new Set();
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        if (!isWhite(fillGrid[r][c])) coloredUnvisited.add(cellKey(r, c));
      }
    }

    const regions = [];
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    while (coloredUnvisited.size) {
      const firstKey = coloredUnvisited.values().next().value;
      const [sr, sc] = firstKey.split(",").map(Number);
      const color = fillGrid[sr][sc];
      const queue = [[sr, sc]];
      const cells = [];
      const labels = [];
      coloredUnvisited.delete(firstKey);

      while (queue.length) {
        const [r, c] = queue.pop();
        cells.push([r, c]);
        const value = valueGrid[r][c]?.trim();
        if (value) labels.push({ value, row: r, col: c });

        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 1 || nr > rows || nc < 1 || nc > cols) continue;
          const key = cellKey(nr, nc);
          if (!coloredUnvisited.has(key)) continue;
          if (!sameColor(fillGrid[nr][nc], color)) continue;
          if (boundaryExists(r, c, nr, nc)) continue;
          coloredUnvisited.delete(key);
          queue.push([nr, nc]);
        }
      }
      regions.push({ color, cells, labels });
    }

    const destinationsById = new Map();
    const occupiedByDestination = new Map();
    const ambiguousRegions = [];

    for (const region of regions) {
      const labelValues = [...new Set(region.labels.map((item) => item.value.replace(/\s+/g, " ")))].filter(Boolean);
      if (labelValues.length !== 1) {
        if (labelValues.length > 1) ambiguousRegions.push(labelValues.join(", "));
        continue;
      }

      const id = labelValues[0];
      if (!destinationsById.has(id)) {
        destinationsById.set(id, {
          id,
          booth: id,
          name: id,
          category: "부스",
          keywords: [],
          type: "booth",
          shapes: [],
          entranceCandidates: []
        });
        occupiedByDestination.set(id, new Set());
      }

      const item = destinationsById.get(id);
      item.shapes.push(...compressCellsToShapes(region.cells, region.color));
      const occupied = occupiedByDestination.get(id);
      for (const [r, c] of region.cells) occupied.add(cellKey(r, c));
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

    const isWalkable = (r, c) =>
      r >= 1 && r <= rows && c >= 1 && c <= cols && walkableRows[r - 1][c - 1] === "1";
    const entranceDirs = [
      { dr: -1, dc: 0, side: "top" },
      { dr: 1, dc: 0, side: "bottom" },
      { dr: 0, dc: -1, side: "left" },
      { dr: 0, dc: 1, side: "right" }
    ];

    for (const item of destinationsById.values()) {
      const occupied = occupiedByDestination.get(item.id);
      const candidates = new Map();
      for (const key of occupied) {
        const [r, c] = key.split(",").map(Number);
        for (const d of entranceDirs) {
          const nr = r + d.dr;
          const nc = c + d.dc;
          if (!isWalkable(nr, nc)) continue;
          const ck = cellKey(nr, nc);
          if (!candidates.has(ck)) {
            candidates.set(ck, { row: nr, col: nc, side: d.side, boothRow: r, boothCol: c });
          }
        }
      }
      item.entranceCandidates = [...candidates.values()];
    }

    const destinations = [...destinationsById.values()]
      .sort((a, b) => a.id.localeCompare(b.id, "ko", { numeric: true }));
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
      version: 2,
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
        duplicateShapeCount: destinations.filter((d) => d.shapes.length > 1).length,
        ambiguousRegions
      }
    };
  }

  async function parseTableWorkbook(file) {
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
    const [workbookText, relsText, sharedText] = await Promise.all([
      readText("xl/workbook.xml"),
      readText("xl/_rels/workbook.xml.rels"),
      readText("xl/sharedStrings.xml", true)
    ]);
    const workbookDoc = parseXml(workbookText);
    const relsDoc = parseXml(relsText);
    const sharedDoc = sharedText ? parseXml(sharedText) : null;
    const sheetInfo = chooseSheet(workbookDoc, relsDoc);
    const sheetDoc = parseXml(await readText(sheetInfo.target));
    const sharedStrings = sharedDoc ? [...sharedDoc.getElementsByTagNameNS(NS, "si")].map((si) =>
      [...si.getElementsByTagNameNS(NS, "t")].map((t) => t.textContent || "").join("")
    ) : [];
    const rows = new Map();
    for (const cell of sheetDoc.getElementsByTagNameNS(NS, "c")) {
      const ref = cell.getAttribute("r");
      if (!ref) continue;
      const pos = parseCellRef(ref);
      const type = cell.getAttribute("t");
      const v = cell.getElementsByTagNameNS(NS, "v")[0];
      let value = v?.textContent || "";
      if (type === "s" && value !== "") value = sharedStrings[Number(value)] || "";
      if (type === "inlineStr") value = [...cell.getElementsByTagNameNS(NS, "t")].map((t) => t.textContent || "").join("");
      if (!rows.has(pos.row)) rows.set(pos.row, new Map());
      rows.get(pos.row).set(pos.col, String(value).trim());
    }
    const orderedRows = [...rows.keys()].sort((a,b)=>a-b);
    if (!orderedRows.length) return { sheetName: sheetInfo.name, headers: [], records: [] };
    const headerRow = rows.get(orderedRows[0]);
    const maxCol = Math.max(...headerRow.keys());
    const headers = Array.from({length:maxCol},(_,i)=>headerRow.get(i+1)||"").map((v)=>v.trim());
    const records = [];
    for (const rowNum of orderedRows.slice(1)) {
      const row = rows.get(rowNum);
      const record = { __row: rowNum };
      let hasValue = false;
      headers.forEach((header,index)=>{
        if (!header) return;
        const value = row.get(index+1) || "";
        record[header] = value;
        if (value) hasValue = true;
      });
      if (hasValue) records.push(record);
    }
    return { sheetName: sheetInfo.name, headers, records };
  }

  window.XlsxGridParser = { parseWorkbook, parseTableWorkbook };
})();
