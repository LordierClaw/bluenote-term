function isCombiningCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    codePoint === 0x200d
  )
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  )
}

export function displayCellWidth(value: string): number {
  let width = 0
  for (const character of Array.from(value)) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint === 0 || codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0) || isCombiningCodePoint(codePoint)) {
      continue
    }
    width += isWideCodePoint(codePoint) ? 2 : 1
  }
  return width
}

export function truncateDisplayCells(value: string, maxCells: number): string {
  if (maxCells <= 0) {
    return ""
  }
  if (displayCellWidth(value) <= maxCells) {
    return value
  }
  if (maxCells === 1) {
    return "…"
  }

  const contentMax = maxCells - 1
  let result = ""
  let width = 0
  for (const character of Array.from(value)) {
    const characterWidth = displayCellWidth(character)
    if (width + characterWidth > contentMax) {
      break
    }
    result += character
    width += characterWidth
  }

  return `${result}…`
}

export function padEndDisplayCells(value: string, cells: number): string {
  const padding = Math.max(0, cells - displayCellWidth(value))
  return `${value}${" ".repeat(padding)}`
}
