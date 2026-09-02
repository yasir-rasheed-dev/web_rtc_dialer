import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Search } from "lucide-react";

import { SkeletonTable } from "./Skeleton";

/**
 * shadcn-style data table — bordered shell, muted header, hover rows, plus a
 * toolbar (text filter + optional faceted selects), click-to-sort headers
 * and client-side pagination. Config-driven, no table library.
 *
 * columns: [{
 *   key, header, align?: "left"|"right"|"center",
 *   cell: (row) => ReactNode,
 *   sortable?: bool, sortValue?: (row) => string|number,   // defaults to row[key]
 *   headerClassName?, cellClassName?
 * }]
 * filters: [{ key, label, getValue: (row) => string, options: [{value,label}] }]
 */
export default function DataTable({
  columns,
  data = [],
  loading = false,
  getRowKey = (row, i) => row.id ?? i,
  onRowClick,
  searchKeys = [],
  searchPlaceholder = "Filter…",
  filters = [],
  toolbarRight = null,
  pageSize = 10,
  initialSort = null, // { key, dir: "asc"|"desc" }
  emptyState = null,
  dense = false
}) {
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState({});
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const alignClass = (a) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  const filtered = useMemo(() => {
    let rows = data;
    const q = query.trim().toLowerCase();
    if (q && searchKeys.length) {
      rows = rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));
    }
    for (const f of filters) {
      const val = facets[f.key];
      if (val) rows = rows.filter((r) => String(f.getValue(r)) === val);
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const getVal = col?.sortValue || ((r) => r[sort.key]);
      rows = [...rows].sort((a, b) => {
        const av = getVal(a);
        const bv = getVal(b);
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sort.dir === "desc" ? -cmp : cmp;
      });
    }
    return rows;
  }, [data, query, facets, filters, sort, columns, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key) => {
    setPage(0);
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const hasToolbar = searchKeys.length > 0 || filters.length > 0 || toolbarRight;

  return (
    <div className="flex flex-col gap-3">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchKeys.length > 0 && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm text-text placeholder:text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-64"
              />
            </div>
          )}
          {filters.map((f) => (
            <select
              key={f.key}
              value={facets[f.key] || ""}
              onChange={(e) => {
                setFacets((cur) => ({ ...cur, [f.key]: e.target.value }));
                setPage(0);
              }}
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-text focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">{f.label}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {toolbarRight && <div className="ml-auto flex items-center gap-2">{toolbarRight}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-4">
              <SkeletonTable rows={6} cols={columns.length} />
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        className={`h-10 whitespace-nowrap px-4 font-semibold ${alignClass(c.align)} ${c.headerClassName || ""}`}
                      >
                        {c.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={`inline-flex items-center gap-1 transition-colors hover:text-text ${active ? "text-text" : ""}`}
                          >
                            {c.header}
                            {active ? (
                              sort.dir === "asc" ? (
                                <ChevronUp size={13} />
                              ) : (
                                <ChevronDown size={13} />
                              )
                            ) : (
                              <ChevronsUpDown size={13} className="opacity-50" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr
                    key={getRowKey(row, i)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-t border-border transition-colors hover:bg-surface-2 ${
                      onRowClick ? "cursor-pointer" : ""
                    }`}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 ${dense ? "py-2.5" : "py-3.5"} align-middle ${alignClass(c.align)} ${
                          c.cellClassName || "text-muted"
                        }`}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!pageRows.length && (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-10 text-center">
                      {emptyState || <span className="text-sm text-muted">No results.</span>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {filtered.length} row{filtered.length === 1 ? "" : "s"}
            {filtered.length !== data.length ? ` (of ${data.length})` : ""}
          </span>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <span>
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text transition-colors hover:bg-surface-2 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-text transition-colors hover:bg-surface-2 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
