// Line diff for the revisions view: a plain LCS over lines, capped so a huge
// body degrades to "everything changed" rather than a quadratic blow-up.

export type DiffOp = { kind: "same" | "add" | "del"; text: string };

const MAX_CELLS = 4_000_000;

export function diffLines(a: string, b: string): DiffOp[] {
  const A = a.split(/\r?\n/);
  const B = b.split(/\r?\n/);
  if (a === b) return A.map((text) => ({ kind: "same", text }));
  if (A.length * B.length > MAX_CELLS) {
    return [...A.map((text) => ({ kind: "del" as const, text })), ...B.map((text) => ({ kind: "add" as const, text }))];
  }
  // Trim the common prefix and suffix first; most edits touch a few lines.
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = A.slice(start, endA);
  const midB = B.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * (m + 1) + j] = midA[i] === midB[j] ? table[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
    }
  }
  const out: DiffOp[] = A.slice(0, start).map((text) => ({ kind: "same", text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      out.push({ kind: "same", text: midA[i] });
      i++;
      j++;
    } else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) {
      out.push({ kind: "del", text: midA[i++] });
    } else {
      out.push({ kind: "add", text: midB[j++] });
    }
  }
  while (i < n) out.push({ kind: "del", text: midA[i++] });
  while (j < m) out.push({ kind: "add", text: midB[j++] });
  for (const text of A.slice(endA)) out.push({ kind: "same", text });
  return out;
}

export function changedCount(ops: DiffOp[]): number {
  return ops.filter((o) => o.kind !== "same").length;
}
