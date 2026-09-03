// Spreadsheet read/write on top of `exceljs` (maintained; no known
// critical CVEs) — replaces the abandoned `xlsx` / SheetJS package, whose
// npm build carries an unpatched prototype-pollution + ReDoS advisory and
// was being run directly on user-uploaded files.
import ExcelJS from "exceljs";

// Hard cap so one enormous upload can't turn into a multi-million-row
// insert loop.
export const MAX_SHEET_ROWS = 200_000;

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    // exceljs wraps some cells: { text, hyperlink } | { richText:[...] } |
    // { result } (formula) | Date.
    if (value instanceof Date) return value.toISOString();
    if (typeof value.text === "string") return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
    if (value.result != null) return String(value.result);
    return "";
  }
  return String(value);
}

// Reads the first worksheet of an .xlsx/.xls/.csv file and returns an
// array of plain objects keyed by the header row — the same shape the old
// `XLSX.utils.sheet_to_json` produced, so callers don't change.
export async function readSheetRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  const lower = String(filePath).toLowerCase();
  if (lower.endsWith(".csv")) {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return [];

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = cellText(cell.value).trim();
  });

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || rows.length >= MAX_SHEET_ROWS) return;
    const obj = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (key) obj[key] = cellText(cell.value);
    });
    if (Object.keys(obj).length) rows.push(obj);
  });
  return rows;
}

// Builds an .xlsx buffer from a header row + array-of-arrays body. Used by
// the report export routes (trusted data, no parsing involved).
export async function writeSheetBuffer(sheetName, header, bodyRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName || "Sheet1");
  sheet.addRow(header);
  for (const row of bodyRows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
