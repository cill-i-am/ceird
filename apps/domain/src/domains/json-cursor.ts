export function encodeJsonCursor<Cursor extends string>(
  value: unknown,
  decodeCursorValue: (value: string) => Cursor
): Cursor {
  return decodeCursorValue(
    Buffer.from(JSON.stringify(value)).toString("base64url")
  );
}

export function decodeJsonCursor<State>(
  cursor: string,
  decodeState: (value: unknown) => State
): State {
  return decodeState(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
  );
}
