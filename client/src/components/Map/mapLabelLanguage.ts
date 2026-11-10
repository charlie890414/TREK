import { basemapLanguage } from './glProviders'

/**
 * MapLibre has no map-level language option. Localize name lookups while preserving
 * the style's other text expressions (road numbers, prefixes, formatting, etc.).
 * The vector source decides which translations are available.
 */
type VectorMap = {
  getStyle: () => unknown
  setLayoutProperty: (id: string, property: string, value: unknown) => unknown
}

const originalFields = new WeakMap<object, Map<string, unknown>>()

function translateNameLookups(node: unknown, fields: string[]): unknown {
  if (Array.isArray(node)) {
    if (node[0] === 'get' && typeof node[1] === 'string' && /^name(?::[\w-]+|_[\w-]+)?$/.test(node[1])) {
      return ['coalesce', ...fields.map(field => ['get', field]), node]
    }
    return node.map(child => translateNameLookups(child, fields))
  }
  return node
}

/** Reinitialize saved expressions when a new style is loaded. */
export function resetVectorLabelLanguage(map: object): void {
  originalFields.delete(map)
}

export function localizeVectorLabels(map: VectorMap, uiLanguage: string | undefined): void {
  const lang = basemapLanguage(uiLanguage)
  const variants = lang === 'zh-Hant' ? ['zh-Hant', 'zh_tw', 'zh-TW'] :
    lang === 'zh-Hans' ? ['zh-Hans', 'zh_cn', 'zh-CN'] : [lang]
  const fields = [...new Set(variants.flatMap(code => [`name:${code}`, `name_${code.replaceAll('-', '_')}`]))]
  let originals = originalFields.get(map)
  if (!originals) {
    originals = new Map()
    originalFields.set(map, originals)
  }
  const style = map.getStyle() as { layers?: Array<{ id: string; type: string; layout?: { 'text-field'?: unknown } }> } | undefined
  for (const layer of style?.layers ?? []) {
    if (layer.type !== 'symbol' || !layer.layout?.['text-field']) continue
    if (!originals.has(layer.id)) originals.set(layer.id, layer.layout['text-field'])
    const original = originals.get(layer.id)
    const translated = translateNameLookups(original, fields)
    if (translated === original || JSON.stringify(translated) === JSON.stringify(original)) continue
    try { map.setLayoutProperty(layer.id, 'text-field', translated) } catch { /* unsupported expression */ }
  }
}

/** Keep embedded MapLibre basemaps in Leaflet in sync with TREK settings and style reloads. */
export function bindVectorLabelLanguage(map: VectorMap & {
  on: (event: string, listener: () => void) => unknown
  once: (event: string, listener: () => void) => unknown
}, currentLanguage: () => string | undefined, subscribe: (listener: () => void) => () => void): void {
  const refresh = () => localizeVectorLabels(map, currentLanguage())
  map.on('style.load', () => {
    resetVectorLabelLanguage(map)
    refresh()
  })
  const unsubscribe = subscribe(refresh)
  map.once('remove', unsubscribe)
  refresh()
}
