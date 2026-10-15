// UNG-338: the meeting id from ungap Meeting is a GUID (the secretary view's URL ends in #meeting/<id>). A pasted URL is
// accepted too, so the secretary can copy the address bar as it is.
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function parseMeetingId(input: string): string | null {
  const match = input.trim().match(GUID)
  return match ? match[0].toLowerCase() : null
}
