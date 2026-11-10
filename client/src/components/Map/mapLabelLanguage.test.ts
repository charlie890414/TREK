import { describe, expect, it, vi } from 'vitest'
import { bindVectorLabelLanguage, localizeVectorLabels, resetVectorLabelLanguage } from './mapLabelLanguage'

function fakeMap(expression: unknown = ['coalesce', ['get', 'name'], ['get', 'ref']]) {
  let field = expression
  const listeners = new Map<string, Array<() => void>>()
  const map = {
    getStyle: () => ({ layers: [
      { id: 'places', type: 'symbol', layout: { 'text-field': field } },
      { id: 'roads', type: 'line' },
    ] }),
    setLayoutProperty: vi.fn((_id: string, _property: string, value: unknown) => { field = value }),
    on: (event: string, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    once: (event: string, listener: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    emit: (event: string) => { for (const fn of listeners.get(event) ?? []) fn() },
    getField: () => field,
  }
  return map
}

describe('vector label localization', () => {
  it('prioritizes the selected locale and keeps the original name as a fallback', () => {
    const map = fakeMap()
    localizeVectorLabels(map, 'fr')
    expect(map.getField()).toEqual([
      'coalesce',
      ['coalesce', ['get', 'name:fr'], ['get', 'name_fr'], ['get', 'name']],
      ['get', 'ref'],
    ])
  })

  it('uses regional name fields for Traditional Chinese instead of hardcoding one locale', () => {
    const map = fakeMap(['get', 'name'])
    localizeVectorLabels(map, 'zh-TW')
    expect(JSON.stringify(map.getField())).toContain('name:zh-Hant')
    expect(JSON.stringify(map.getField())).toContain('name:zh-TW')
    expect(JSON.stringify(map.getField())).toContain('name')
  })

  it('switches languages without nesting translations', () => {
    const map = fakeMap(['get', 'name'])
    localizeVectorLabels(map, 'de')
    localizeVectorLabels(map, 'ja')
    expect(map.getField()).toEqual(['coalesce', ['get', 'name:ja'], ['get', 'name_ja'], ['get', 'name']])
  })

  it('resets stored expressions when a different style is loaded', () => {
    const map = fakeMap(['get', 'name'])
    localizeVectorLabels(map, 'en')
    resetVectorLabelLanguage(map)
    localizeVectorLabels(map, 'es')
    expect(JSON.stringify(map.getField())).toContain('name:es')
  })

  it('subscribes to language changes and cleans up on removal', () => {
    const map = fakeMap(['get', 'name'])
    let language = 'en'
    let refresh: () => void = () => {}
    const unsubscribe = vi.fn()
    bindVectorLabelLanguage(map, () => language, listener => { refresh = listener; return unsubscribe })
    language = 'it'
    refresh()
    expect(JSON.stringify(map.getField())).toContain('name:it')
    map.emit('remove')
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
