import { useState, useEffect, useRef } from 'react';

const PREFIX = 'radio:';

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    // JSONが壊れている / プライベートブラウジングで localStorage が使えない
    console.warn(`[storage] failed to read "${key}":`, err);
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    // 容量超過やストレージ無効時。永続化できなくても動作は継続させる。
    console.warn(`[storage] failed to write "${key}":`, err);
  }
}

/**
 * useState と同じインターフェースで、値を localStorage に永続化するフック。
 *
 * serialize / deserialize を渡すと Set や Map など JSON 化できない値も扱える。
 */
export function usePersistedState(key, initialValue, options = {}) {
  const { serialize = (v) => v, deserialize = (v) => v } = options;
  const optionsRef = useRef({ serialize, deserialize });
  optionsRef.current = { serialize, deserialize };

  const [state, setState] = useState(() => {
    const stored = read(key, undefined);
    if (stored === undefined) return initialValue;
    try {
      return deserialize(stored);
    } catch (err) {
      console.warn(`[storage] failed to deserialize "${key}":`, err);
      return initialValue;
    }
  });

  useEffect(() => {
    write(key, optionsRef.current.serialize(state));
  }, [key, state]);

  return [state, setState];
}

/** Set<number> 用のシリアライザ */
export const setOfIds = {
  serialize: (set) => [...set],
  deserialize: (arr) => new Set(Array.isArray(arr) ? arr : []),
};

export { read as readStored, write as writeStored };
