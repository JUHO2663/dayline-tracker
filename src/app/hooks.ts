import { useEffect, useState } from 'react';
import type { TableName, TableTypes } from '../db/types';
import { useDb } from './DbContext';

/** All rows of a table; re-renders after any write to it. undefined while loading. */
export function useTable<K extends TableName>(table: K): TableTypes[K][] | undefined {
  const { db } = useDb();
  const [rows, setRows] = useState<TableTypes[K][]>();

  useEffect(() => {
    let alive = true;
    const load = () =>
      db.all(table).then((r) => {
        if (alive) setRows(r);
      });
    void load();
    const unsubscribe = db.subscribe((tables) => {
      if (tables.has(table)) void load();
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [db, table]);

  return rows;
}

/** Current time, refreshed every `intervalMs` so "today" and overdue states stay correct. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
