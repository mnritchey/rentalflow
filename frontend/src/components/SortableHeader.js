import { useState } from 'react';

/**
 * SortableHeader — <th> that cycles asc → desc → cleared on click.
 * Props: col, label, sort { col, dir }, onSort(col), style?
 */
export default function SortableHeader({ col, label, sort, onSort, style }) {
  const active = sort.col === col;
  const icon   = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  return (
    <th
      onClick={() => onSort(col)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        color: active ? 'var(--accent)' : undefined,
        ...style,
      }}
    >
      {label}
      <span style={{ opacity: active ? 1 : 0.3, fontSize: 10, marginLeft: 2 }}>
        {icon}
      </span>
    </th>
  );
}

/**
 * useSortedData(data, initial?) → { sort, onSort, sorted }
 * Sorts `data` in-place based on sort state.
 * Third click on same column resets to original order.
 */
export function useSortedData(data, initial = { col: null, dir: 'asc' }) {
  const [sort, setSort] = useState(initial);

  const onSort = (col) => {
    setSort(prev => {
      if (prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return { col: null, dir: 'asc' }; // third click clears
    });
  };

  const sorted = sort.col
    ? [...data].sort((a, b) => {
        const av = a[sort.col] ?? '';
        const bv = b[sort.col] ?? '';
        const an = parseFloat(av), bn = parseFloat(bv);
        const cmp = (!isNaN(an) && !isNaN(bn))
          ? an - bn
          : String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
        return sort.dir === 'asc' ? cmp : -cmp;
      })
    : data;

  return { sort, onSort, sorted };
}
