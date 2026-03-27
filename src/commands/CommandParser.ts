/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class CommandParser {
  static parse(input: string): { type: string; value?: string } | null {
    const lower = input.toLowerCase();

    if (lower.includes("open youtube")) {
      return { type: "OPEN_APP", value: "https://www.youtube.com" };
    }
    if (lower.includes("open whatsapp")) {
      return { type: "OPEN_APP", value: "https://web.whatsapp.com" };
    }
    if (lower.startsWith("search ")) {
      const query = input.slice(7).trim();
      return { type: "SEARCH", value: `https://www.google.com/search?q=${encodeURIComponent(query)}` };
    }

    return null;
  }

  static execute(command: { type: string; value?: string }) {
    if (command.type === "OPEN_APP" || command.type === "SEARCH") {
      if (command.value) {
        window.open(command.value, "_blank");
      }
    }
  }
}
