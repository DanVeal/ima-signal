/**
 * Parses one PRAMS workbook sheet into a structural representation: the
 * announcement columns (reference + title), the spoken-line rows, and the
 * authored merged-cell groups within each row — read directly from the
 * worksheet's own merge metadata, never inferred from matching text (see
 * the Phase 2B data-model rules).
 *
 * Only reads structure. Never writes to the database — see
 * src/lib/prams-import/import-service.ts for the diff/preview/commit steps
 * that turn this into persisted rows.
 */
import ExcelJS from "exceljs";

export interface ParsedAnnouncementColumn {
  /** 1-based worksheet column index. */
  columnIndex: number;
  /** The reference code exactly as it appeared in the workbook cell, before normalisation. */
  referenceCodeRaw: string;
  title: string;
  tags: string[];
}

export interface ParsedCellGroup {
  /** Contiguous 1-based column indexes this authored cell spans. */
  columnIndexes: number[];
  /** null = an intentionally blank cell in the source. */
  text: string | null;
}

export interface ParsedRow {
  /** 1-based worksheet row index — the basis for this row's stable row_key. */
  rowIndex: number;
  groups: ParsedCellGroup[];
}

export interface ParsedSection {
  sheetName: string;
  sectionTitle: string;
  columns: ParsedAnnouncementColumn[];
  rows: ParsedRow[];
}

export interface ParsedWorkbook {
  sections: ParsedSection[];
}

// Reference code and title are separated by the FIRST period in the cell —
// e.g. "080.J2 - BOARDING" is code "080", title "J2 - BOARDING" (any
// hyphens after that point are part of the title's own wording, not a
// second delimiter). Confirmed against the real PRAMS workbook convention,
// which is NOT consistently hyphen-separated (see docs/phase-2b-limitations.md).
const REFERENCE_TITLE_PATTERN = /^([^.\s]+)\.(.+)$/;
const MAX_HEADER_SEARCH_ROWS = 20;
const MAX_DATA_ROWS = 500;

function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "object" && "richText" in value) {
    const text = (value.richText as { text: string }[]).map((r) => r.text).join("");
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return String(value).trim() || null;
}

function extractTags(title: string): string[] {
  const tags: string[] = [];
  if (/\bVIP\b/i.test(title)) tags.push("VIP");
  if (/\bFUEL\b/i.test(title)) tags.push("Fuel");
  return tags;
}

/**
 * Splits a header cell into code + title. The period-first rule only holds
 * when what precedes the period actually looks like a reference code
 * (starts with a digit, e.g. "080", "011A") — a handful of cells (e.g.
 * "AIRBUS.A321CEO_DEMO") use a non-numeric prefix that isn't a code at all,
 * and splitting those would collide two different announcements onto the
 * same reference_code (which is globally unique). For those, the whole
 * cell is the code, with no title split — confirmed against the real
 * workbook rather than inferred.
 */
function extractCodeAndTitle(text: string): { code: string; title: string } | null {
  const match = REFERENCE_TITLE_PATTERN.exec(text);
  if (!match) return null;
  const [, code, title] = match;
  if (/^\d/.test(code)) return { code, title };
  return { code: text, title: text };
}

/** Parses merges of the shape "C5:D5" into { row, startCol, endCol }, ignoring any vertical merge. */
function parseHorizontalMerges(merges: string[]): Map<number, { start: number; end: number }[]> {
  const byRow = new Map<number, { start: number; end: number }[]>();
  for (const range of merges) {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
    if (!match) continue;
    const [, startColLetters, startRowStr, endColLetters, endRowStr] = match;
    const startRow = Number(startRowStr);
    const endRow = Number(endRowStr);
    if (startRow !== endRow) continue; // vertical/rectangular merges aren't part of this model
    const start = columnLettersToIndex(startColLetters);
    const end = columnLettersToIndex(endColLetters);
    const list = byRow.get(startRow) ?? [];
    list.push({ start, end });
    byRow.set(startRow, list);
  }
  return byRow;
}

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - "A".charCodeAt(0) + 1);
  }
  return index;
}

/**
 * Parses one sheet using the observed PRAMS convention: a section title in
 * column A a few rows up, a header row with "<reference> - <title>" per
 * announcement column, then spoken-line rows until the first row that's
 * entirely blank.
 */
export function parseSection(worksheet: ExcelJS.Worksheet): ParsedSection {
  const merges = parseHorizontalMerges(
    (worksheet.model as unknown as { merges: string[] }).merges ?? [],
  );

  let sectionTitle = worksheet.name;
  let headerRowIndex = -1;
  let firstCol = -1;
  let lastCol = -1;

  for (let r = 1; r <= MAX_HEADER_SEARCH_ROWS; r++) {
    const row = worksheet.getRow(r);
    const titleInA = cellText(row.getCell(1).value);
    if (titleInA && headerRowIndex === -1) sectionTitle = titleInA;

    const headerCells: { col: number; text: string }[] = [];
    const maxCol = Math.min(worksheet.columnCount + 1, 50);
    for (let c = 2; c <= maxCol; c++) {
      const text = cellText(row.getCell(c).value);
      if (text && REFERENCE_TITLE_PATTERN.test(text)) headerCells.push({ col: c, text });
    }
    if (headerCells.length >= 2) {
      headerRowIndex = r;
      firstCol = headerCells[0].col;
      lastCol = headerCells[headerCells.length - 1].col;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(`Could not find an announcement header row in sheet "${worksheet.name}"`);
  }

  const columns: ParsedAnnouncementColumn[] = [];
  const headerRow = worksheet.getRow(headerRowIndex);
  for (let c = firstCol; c <= lastCol; c++) {
    const text = cellText(headerRow.getCell(c).value);
    if (!text) continue;
    const parsed = extractCodeAndTitle(text);
    if (!parsed) continue;
    columns.push({ columnIndex: c, referenceCodeRaw: parsed.code, title: parsed.title, tags: extractTags(parsed.title) });
  }

  const rows: ParsedRow[] = [];
  for (let r = headerRowIndex + 1; r <= headerRowIndex + MAX_DATA_ROWS; r++) {
    const row = worksheet.getRow(r);
    const rowIsEntirelyBlank = row.actualCellCount === 0 || row.values === undefined ||
      (Array.isArray(row.values) && (row.values as unknown[]).every((v) => v === null || v === undefined));
    if (rowIsEntirelyBlank) break;

    const rowMerges = merges.get(r) ?? [];
    const groups: ParsedCellGroup[] = [];
    let col = firstCol;
    while (col <= lastCol) {
      const merge = rowMerges.find((m) => m.start === col);
      const endCol = merge ? Math.min(merge.end, lastCol) : col;
      const columnIndexes: number[] = [];
      for (let g = col; g <= endCol; g++) columnIndexes.push(g);
      const text = cellText(row.getCell(col).value);
      groups.push({ columnIndexes, text });
      col = endCol + 1;
    }
    rows.push({ rowIndex: r, groups });
  }

  return { sheetName: worksheet.name, sectionTitle, columns, rows };
}

/**
 * Some sheets aren't a side-by-side matrix at all: a single column holds
 * several unrelated, standalone announcements stacked vertically, each its
 * own header cell followed by its lines, separated by a blank gap (e.g.
 * "Doors": "010.ARM DOORS" + its line, then lower down in the SAME column,
 * the unrelated "065.DISARM DOORS" + its line). Each such block becomes its
 * own one-column ParsedSection — the diff/commit pipeline in
 * import-service.ts needs no changes to handle a section with one column.
 * Scanned per-column (not row-then-column) so two blocks in different
 * columns can never have their lines cross-attributed to each other.
 */
export function parseVerticalBlocks(worksheet: ExcelJS.Worksheet): ParsedSection[] {
  const maxCol = Math.min(worksheet.columnCount + 1, 50);
  const maxRow = Math.min(worksheet.rowCount, MAX_DATA_ROWS);
  const sections: ParsedSection[] = [];

  for (let c = 2; c <= maxCol; c++) {
    let current: { code: string; title: string; rows: ParsedRow[] } | null = null;

    const flush = () => {
      if (!current) return;
      sections.push({
        sheetName: worksheet.name,
        sectionTitle: current.title,
        columns: [{ columnIndex: c, referenceCodeRaw: current.code, title: current.title, tags: extractTags(current.title) }],
        rows: current.rows,
      });
      current = null;
    };

    for (let r = 1; r <= maxRow; r++) {
      const text = cellText(worksheet.getRow(r).getCell(c).value);
      const parsed = text ? extractCodeAndTitle(text) : null;

      if (parsed) {
        flush();
        current = { code: parsed.code, title: parsed.title, rows: [] };
        continue;
      }
      if (!current || text === null) continue;

      current.rows.push({ rowIndex: r, groups: [{ columnIndexes: [c], text }] });
    }
    flush();
  }

  return sections;
}

export async function parseWorkbook(buffer: Buffer, sheetNames: string[]): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled Buffer type declaration lags Node's — this is a safe
  // structural cast, not a behavioural one.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sections: ParsedSection[] = [];
  for (const sheetName of sheetNames) {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) throw new Error(`Sheet "${sheetName}" not found in workbook`);
    sections.push(parseSection(worksheet));
  }
  return { sections };
}
