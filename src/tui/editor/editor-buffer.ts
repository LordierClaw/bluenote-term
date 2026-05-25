export interface EditorCursor {
  row: number
  column: number
}

export interface EditorBuffer {
  lines: string[]
  cursor: EditorCursor
  dirty: boolean
}

function clampRow(lines: string[], row: number): number {
  return Math.min(Math.max(row, 0), lines.length - 1)
}

function clampColumn(line: string, column: number): number {
  return Math.min(Math.max(column, 0), line.length)
}

function normalizeLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n")
}

function lineAt(lines: string[], row: number): string {
  return lines[clampRow(lines, row)] ?? ""
}

export function createEditorBuffer(text: string): EditorBuffer {
  const lines = normalizeLines(text)

  return {
    lines,
    cursor: { row: 0, column: 0 },
    dirty: false,
  }
}

export function getEditorText(buffer: EditorBuffer): string {
  return buffer.lines.join("\n")
}

export function moveCursorLeft(buffer: EditorBuffer): EditorBuffer {
  return {
    ...buffer,
    cursor: {
      row: buffer.cursor.row,
      column: Math.max(buffer.cursor.column - 1, 0),
    },
  }
}

export function moveCursorRight(buffer: EditorBuffer): EditorBuffer {
  const row = clampRow(buffer.lines, buffer.cursor.row)
  const line = lineAt(buffer.lines, row)

  return {
    ...buffer,
    cursor: {
      row,
      column: clampColumn(line, buffer.cursor.column + 1),
    },
  }
}

export function moveCursorUp(buffer: EditorBuffer): EditorBuffer {
  const row = clampRow(buffer.lines, buffer.cursor.row - 1)
  const line = lineAt(buffer.lines, row)

  return {
    ...buffer,
    cursor: {
      row,
      column: clampColumn(line, buffer.cursor.column),
    },
  }
}

export function moveCursorDown(buffer: EditorBuffer): EditorBuffer {
  const row = clampRow(buffer.lines, buffer.cursor.row + 1)
  const line = lineAt(buffer.lines, row)

  return {
    ...buffer,
    cursor: {
      row,
      column: clampColumn(line, buffer.cursor.column),
    },
  }
}

export function insertCharacter(buffer: EditorBuffer, character: string): EditorBuffer {
  const row = clampRow(buffer.lines, buffer.cursor.row)
  const line = lineAt(buffer.lines, row)
  const column = clampColumn(line, buffer.cursor.column)
  const lines = [...buffer.lines]
  lines[row] = `${line.slice(0, column)}${character}${line.slice(column)}`

  return {
    lines,
    cursor: { row, column: column + character.length },
    dirty: true,
  }
}

export function insertNewline(buffer: EditorBuffer): EditorBuffer {
  const row = clampRow(buffer.lines, buffer.cursor.row)
  const line = lineAt(buffer.lines, row)
  const column = clampColumn(line, buffer.cursor.column)
  const lines = [...buffer.lines]
  lines.splice(row, 1, line.slice(0, column), line.slice(column))

  return {
    lines,
    cursor: { row: row + 1, column: 0 },
    dirty: true,
  }
}

export function backspace(buffer: EditorBuffer): EditorBuffer {
  const row = clampRow(buffer.lines, buffer.cursor.row)
  const line = lineAt(buffer.lines, row)
  const column = clampColumn(line, buffer.cursor.column)

  if (column > 0) {
    const lines = [...buffer.lines]
    lines[row] = `${line.slice(0, column - 1)}${line.slice(column)}`

    return {
      lines,
      cursor: { row, column: column - 1 },
      dirty: true,
    }
  }

  if (row === 0) {
    return buffer
  }

  const previousLine = lineAt(buffer.lines, row - 1)
  const lines = [...buffer.lines]
  lines.splice(row - 1, 2, `${previousLine}${line}`)

  return {
    lines,
    cursor: { row: row - 1, column: previousLine.length },
    dirty: true,
  }
}

export function deleteForward(buffer: EditorBuffer): EditorBuffer {
  const row = clampRow(buffer.lines, buffer.cursor.row)
  const line = lineAt(buffer.lines, row)
  const column = clampColumn(line, buffer.cursor.column)

  if (column < line.length) {
    const lines = [...buffer.lines]
    lines[row] = `${line.slice(0, column)}${line.slice(column + 1)}`

    return {
      lines,
      cursor: { row, column },
      dirty: true,
    }
  }

  if (row === buffer.lines.length - 1) {
    return buffer
  }

  const nextLine = lineAt(buffer.lines, row + 1)
  const lines = [...buffer.lines]
  lines.splice(row, 2, `${line}${nextLine}`)

  return {
    lines,
    cursor: { row, column },
    dirty: true,
  }
}
