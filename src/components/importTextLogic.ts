import { plural, t } from '@lingui/core/macro'
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
      problem = t`Line ${index + 1} is too long (${line.length} characters, at most ${IMPORT_MAX_LINE_LENGTH}).`
    }
  })
  if (problem === null && lines > IMPORT_MAX_LINES) problem = t`Too many lines (${lines}, at most ${IMPORT_MAX_LINES}).`
  return { lines, blank, problem }
}


/** "Skapade 58 punkter, ersatte 3, tog bort 1, hoppade över 2 tomma rader." */
export function importSummary(kind: ImportKind, result: TextImportCounts): string {
  const { created, replaced, removed, skipped } = result
  const agenda = kind === 'agenda'
  const parts: string[] = []
  if (created > 0) parts.push(agenda ? plural(created, { one: 'created # item', other: 'created # items' }) : plural(created, { one: 'created # name', other: 'created # names' }))
  if (replaced > 0) {
    parts.push(created > 0
      ? t`replaced ${replaced}`
      : agenda ? plural(replaced, { one: 'replaced # item', other: 'replaced # items' }) : plural(replaced, { one: 'replaced # name', other: 'replaced # names' }))
  }
  if (removed > 0) parts.push(t`removed ${removed}`)
  if (skipped > 0) parts.push(plural(skipped, { one: 'skipped # empty line', other: 'skipped # empty lines' }))
  if (parts.length === 0) return t`Nothing to import.`
  const sentence = parts.join(', ')
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`
}
