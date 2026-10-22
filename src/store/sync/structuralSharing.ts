import { contentEqual } from './projectDifferences';

// Background syncs rebuild collections from the server; returning the previous reference when
// nothing changed lets selectors, memoized views and persistence skip the update.

/** The previous value when the rebuilt one has the same JSON content. */
export const reuseIfEqual = <T>(previous: T | undefined, next: T): T => previous !== undefined && contentEqual(previous, next) ? previous : next;

/** The previous array when every element keeps its reference. */
export const reuseArray = <T>(previous: T[], next: T[]): T[] => previous.length === next.length && next.every((item, index) => item === previous[index]) ? previous : next;

/** The previous record when every entry keeps its reference. */
export const reuseRecord = <T>(previous: Record<string, T>, next: Record<string, T>): Record<string, T> => {
  const keys = Object.keys(next);
  return keys.length === Object.keys(previous).length && keys.every(key => key in previous && previous[key] === next[key]) ? previous : next;
};
