export async function* jsonRecordStream(chunks, { maxCharacters = 32 * 1024 * 1024 } = {}) {
  let buffer = "", depth = 0, quoted = false, escaped = false, controls = 0, index = 0;
  for await (const chunk of chunks) {
    for (const character of String(chunk)) {
      if (!depth) {
        if (/\s/.test(character)) continue;
        if (character !== "{") throw new Error(`Invalid snapshot record boundary at ${index + 1}`);
      }
      if (quoted) {
        if (character.charCodeAt(0) < 32) {
          const replacement = `u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
          buffer += escaped ? replacement : "\\" + replacement;
          escaped = false; controls++;
        } else {
          buffer += character;
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') quoted = false;
        }
      } else {
        buffer += character;
        if (character === '"') quoted = true;
        else if (character === "{" || character === "[") depth++;
        else if (character === "}" || character === "]") depth--;
      }
      if (buffer.length > maxCharacters) throw new Error(`Oversized snapshot record at ${index + 1}`);
      if (!depth) {
        let value;
        try { value = JSON.parse(buffer); } catch { throw new Error(`Invalid snapshot JSON record at ${index + 1}`); }
        yield { value, normalizedControls: controls };
        index++; buffer = ""; controls = 0;
      }
    }
  }
  if (buffer || depth || quoted) throw new Error(`Truncated snapshot record at ${index + 1}`);
}
