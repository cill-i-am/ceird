import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type {
  HotkeyCallback,
  HotkeyMeta,
  HotkeySequence,
  RegisterableHotkey,
  UseHotkeyOptions,
  UseHotkeySequenceOptions,
} from "@tanstack/react-hotkeys";

import { HOTKEYS } from "./hotkey-registry";
import type { HotkeyDefinition, HotkeyId } from "./hotkey-registry";

function splitHotkeySequence(hotkey: string) {
  return hotkey.split(/\s+/).filter(Boolean);
}

function getHotkeyMeta(id: HotkeyId, meta?: HotkeyMeta) {
  const definition = getHotkeyDefinition(id);

  return {
    description: definition.when,
    ...meta,
    appHotkeyId: id,
    name: definition.label,
  };
}

function getHotkeyDefinition(id: HotkeyId): HotkeyDefinition {
  return HOTKEYS[id];
}

export function useAppHotkey(
  id: HotkeyId,
  callback: HotkeyCallback,
  options: UseHotkeyOptions = {}
) {
  const definition = getHotkeyDefinition(id);

  useHotkey(definition.hotkey as RegisterableHotkey, callback, {
    preventDefault: true,
    stopPropagation: false,
    ...options,
    meta: getHotkeyMeta(id, options.meta),
  });
}

export function useAppHotkeySequence(
  id: HotkeyId,
  callback: HotkeyCallback,
  options: UseHotkeySequenceOptions = {}
) {
  const definition = getHotkeyDefinition(id);

  useHotkeySequence(
    splitHotkeySequence(definition.hotkey) as HotkeySequence,
    callback,
    {
      preventDefault: true,
      stopPropagation: false,
      ...options,
      meta: getHotkeyMeta(id, options.meta),
    }
  );
}
