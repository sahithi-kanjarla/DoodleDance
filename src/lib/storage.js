// Character persistence. localStorage for now; this is the seam where the
// Supabase `characters` table plugs in later (same shape).
const KEY = 'motionparty.characters.v1';

export function listCharacters() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveCharacter(c) {
  const all = listCharacters().filter((x) => x.id !== c.id);
  all.unshift(c);
  localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

export function deleteCharacter(id) {
  const all = listCharacters().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
