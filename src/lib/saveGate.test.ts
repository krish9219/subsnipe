import { describe, expect, it } from 'vitest';
import { createSaveGate } from './saveGate';

describe('save gate', () => {
  it('lets a later save through after wipe and a new statement', () => {
    const gate = createSaveGate();
    gate.allow();
    expect(gate.canSave()).toBe(true);
    gate.wipe();
    expect(gate.canSave()).toBe(false);
    gate.noteData(12);
    gate.allow();
    expect(gate.canSave()).toBe(true);
  });

  it('lifts the wipe block when new rows arrive even before save is clicked', () => {
    const gate = createSaveGate();
    gate.wipe();
    gate.noteData(4);
    expect(gate.canSave()).toBe(true);
  });
});
