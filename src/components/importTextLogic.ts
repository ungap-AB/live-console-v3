import type { TextImportCounts } from '../data/types'

// UNG-197: logiken runt dialogen för att importera punkter och namn. Servern gör själva uppdelningen och är facit; här finns bara
// förkontrollen (samma gränser och radnummer som servern) och texten som berättar vad som hände.

export const IMPORT_MAX_LINES = 500
export const IMPORT_MAX_LINE_LENGTH = 300

export type ImportKind = 'agenda' | 'namelist'

export interface ImportTextCheck {
  /** Rader med text (tomma hoppas över). */
  lines: number
  blank: number
  /** Ett felmeddelande om servern skulle avvisa texten, annars null. */
  problem: string | null
}

export function checkImportText(text: string): ImportTextCheck {
  const rows = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  let lines = 0
  let blank = 0
  let problem: string | null = null
  rows.forEach((row, index) => {
    const line = row.trim()
    if (line.length === 0) {
      blank += 1
      return
    }
    lines += 1
    if (problem === null && line.length > IMPORT_MAX_LINE_LENGTH) {
      problem = `Rad ${index + 1} är för lång (${line.length} tecken, högst ${IMPORT_MAX_LINE_LENGTH}).`
    }
  })
  if (problem === null && lines > IMPORT_MAX_LINES) problem = `För många rader (${lines}, högst ${IMPORT_MAX_LINES}).`
  return { lines, blank, problem }
}

const words = {
  agenda: { one: 'punkt', many: 'punkter' },
  namelist: { one: 'namn', many: 'namn' },
} as const

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`

/** "Skapade 58 punkter, ersatte 3, tog bort 1, hoppade över 2 tomma rader." */
export function importSummary(kind: ImportKind, result: TextImportCounts): string {
  const noun = words[kind]
  const parts: string[] = []
  if (result.created > 0) parts.push(`skapade ${count(result.created, noun.one, noun.many)}`)
  if (result.replaced > 0) parts.push(result.created > 0 ? `ersatte ${result.replaced}` : `ersatte ${count(result.replaced, noun.one, noun.many)}`)
  if (result.removed > 0) parts.push(`tog bort ${result.removed}`)
  if (result.skipped > 0) parts.push(`hoppade över ${count(result.skipped, 'tom rad', 'tomma rader')}`)
  if (parts.length === 0) return 'Inget att importera.'
  const sentence = parts.join(', ')
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`
}
