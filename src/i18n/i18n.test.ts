import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { i18n } from '@lingui/core'
import { messages as enMessages } from '../locales/en.ts'
import { publishedCopy } from '../views/projects/publishOutcome.ts'
import { activateForTests, resolveLocale } from './index.ts'

afterEach(() => activateForTests('sv'))

test('Swedish unless ?lang= asks for English; pseudo only when allowed (development)', () => {
  assert.equal(resolveLocale('', true), 'sv')
  assert.equal(resolveLocale('?lang=en', false), 'en')
  assert.equal(resolveLocale('?p=abc&lang=sv', false), 'sv')
  assert.equal(resolveLocale('?lang=pseudo', false), 'sv')
  assert.equal(resolveLocale('?lang=pseudo', true), 'pseudo')
  assert.equal(resolveLocale('?lang=de', true), 'sv')
  for (const lang of ['eng', 'EN', 'en-GB', 'en_US']) assert.equal(resolveLocale(`?lang=${lang}`, false), 'en')
  assert.equal(resolveLocale('?lang=swe', false), 'sv')
})

test('the same view in English, with English plurals and number format', () => {
  i18n.loadAndActivate({ locale: 'en', locales: ['en-GB'], messages: enMessages })
  const copy = publishedCopy({ wasPublished: false, visibility: 'open', chapterCount: 1, captions: { label: 'Swedish', cueCount: 1240 } })
  assert.equal(copy.title, 'On demand published')
  assert.deepEqual(copy.facts, ['1 chapter', 'Captions: Swedish (1,240 lines)'])
})
