/** A plain left-aligned table, like the CLI's other list output. */
export function renderTable(
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: ReadonlyArray<string>) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]!)))
      .join("   ")
      .trimEnd();
  return [line(headers), ...rows.map(line)].join("\n") + "\n";
}
