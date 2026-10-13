import type { Plugin } from 'vite'

export function transformLinguiMacros(code: string, filename: string): Promise<{ code: string; map: unknown } | null>
export function linguiMacros(): Plugin
