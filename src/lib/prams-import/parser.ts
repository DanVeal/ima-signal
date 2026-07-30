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

const REFERENCE_TITLE_PATTERN = /^(\S+)\s*-\s*(.+)$/;
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
    const match = REFERENCE_TITLE_PATTERN.exec(text);
    if (!match) continue;
    const [, referenceCodeRaw, title] = match;
    columns.push({ columnIndex: c, referenceCodeRaw, title, tags: extractTags(title) });
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
