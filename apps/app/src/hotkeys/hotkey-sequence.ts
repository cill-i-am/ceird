export function splitHotkeySequence(hotkey: string) {
  return hotkey.split(/\s+/).filter(Boolean);
}
