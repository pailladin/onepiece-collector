const CARDMARKET_LOCALE = 'fr'
const CARDMARKET_GAME = 'OnePiece'

function buildCardmarketBase(path: string) {
  return `https://www.cardmarket.com/${CARDMARKET_LOCALE}/${CARDMARKET_GAME}${path}`
}

export function buildCardmarketProductUrl(productId: string | number) {
  return `${buildCardmarketBase('/Products')}?idProduct=${encodeURIComponent(String(productId))}`
}

export function buildCardmarketSinglesSearchUrl(search: string) {
  return `${buildCardmarketBase('/Products/Singles')}?searchMode=v2&idCategory=1621&idExpansion=0&searchString=${encodeURIComponent(
    search
  )}&idRarity=0&perSite=30`
}

export function buildCardmarketProductOrSearchUrl(params: {
  productId?: string | number | null
  search: string
}) {
  if (params.productId) return buildCardmarketProductUrl(params.productId)
  return buildCardmarketSinglesSearchUrl(params.search)
}

export function buildCardmarketSearchPageUrl(search: string) {
  return `${buildCardmarketBase('/Products/Search')}?searchMode=v2&idCategory=0&idExpansion=0&searchString=${encodeURIComponent(
    search
  )}`
}
