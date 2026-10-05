// Compare each original slice with the total before combining small slices.
export function groupSmallSlices(rows) {
  const positive = rows.filter(row => Number.isFinite(row.value) && row.value > 0);
  const total = positive.reduce((sum, row) => sum + row.value, 0);
  const small = positive.filter(row => row.value * 100 < total);
  if (!small.length) return positive;

  const others = {
    name: 'Others',
    value: small.reduce((sum, row) => sum + row.value, 0),
    color: '#94a3b8',
    isHighlight: false,
  };
  for (const field of ['rawCurrency', 'profit']) {
    if (small.some(row => field in row)) {
      others[field] = small.some(row => row[field] == null)
        ? null
        : small.reduce((sum, row) => sum + row[field], 0);
    }
  }
  return [...positive.filter(row => row.value * 100 >= total), others];
}
