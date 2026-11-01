/**
 * Wipe blocks a debounced save from writing the cleared scan back.
 * The block must lift when the user saves again or loads a new statement.
 */
export type SaveGate = {
  blocked: boolean;
  wipe: () => void;
  noteData: (count: number) => void;
  allow: () => void;
  canSave: () => boolean;
};

export function createSaveGate(): SaveGate {
  return {
    blocked: false,
    wipe() {
      this.blocked = true;
    },
    noteData(count: number) {
      if (count > 0) this.blocked = false;
    },
    allow() {
      this.blocked = false;
    },
    canSave() {
      return !this.blocked;
    },
  };
}
