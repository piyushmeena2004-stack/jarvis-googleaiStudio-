/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, Type } from "@google/genai";

export const MODEL = "gemini-3.1-flash-live-preview";
export const SAMPLE_RATE = 16000;
export const SYSTEM_INSTRUCTION = "You are JARVIS, a highly sophisticated AI assistant for a mobile phone. Your tone is professional, British, slightly witty, and always helpful. You have access to mobile phone systems (battery, display, audio, connectivity, storage) via the 'controlMobileSystem' tool. Use it when the user asks to check or change phone settings. Address the user as 'Sir' or 'Ma'am'.";

export const controlMobileSystemTool: FunctionDeclaration = {
  name: "controlMobileSystem",
  description: "Control or query mobile phone systems (battery, display, audio, connectivity, storage).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      system: { type: Type.STRING, enum: ["battery", "display", "audio", "connectivity", "storage"], description: "The system to target." },
      action: { type: Type.STRING, description: "Action like 'toggle', 'set', 'query'." },
      value: { type: Type.STRING, description: "Value for the action." },
    },
    required: ["system", "action", "value"],
  },
};

export interface AudioState {
  isListening: boolean;
  isSpeaking: boolean;
  volume: number;
}

export interface MobileData {
  battery: { level: number; status: string; health: string };
  display: { brightness: number; mode: string; refreshRate: string };
  audio: { volume: number; mode: string };
  connectivity: { signal: string; wifi: string; bluetooth: string };
  storage: { used: number; total: number };
}

export const VOICE_MODULES = [
  { id: 'Zephyr', name: 'ZEPHYR (DEFAULT)', description: 'Balanced, professional' },
  { id: 'Puck', name: 'PUCK', description: 'Energetic, witty' },
  { id: 'Charon', name: 'CHARON', description: 'Deep, authoritative' },
  { id: 'Kore', name: 'KORE', description: 'Soft, refined' },
  { id: 'Fenrir', name: 'FENRIR', description: 'Bold, direct' },
];
