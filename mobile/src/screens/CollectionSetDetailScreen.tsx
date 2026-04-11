import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { User } from '@supabase/supabase-js'
import { fetchCollectionSetDetail, updateCollectionItemQuantity } from '../features/collection/service'
import type { CollectionSetDetail } from '../features/collection/types'
import { useWishlist } from '../hooks/useWishlist'

type Props = {
  user: User
  setCode: string
  onBack: () => void
}

export function CollectionSetDetailScreen({ user, setCode, onBack }: Props) {
  const { isWishlisted, toggleWishlist, busyPrintId } = useWishlist(user.id)
  const [detail, setDetail] = useState<CollectionSetDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'all' | 'owned' | 'missing'>('all')
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  const load = async (kind: 'initial' | 'refresh' = 'initial') => {
    if (kind === 'initial') setLoading(true)
    if (kind === 'refresh') setRefreshing(true)
    setError(null)

    try {
      const data = await fetchCollectionSetDetail(user.id, setCode)
      setDetail(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erreur chargement set.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [user.id, setCode])

  const visibleItems = useMemo(() => {
    const items = detail?.items || []
    const normalizedQuery = query.trim().toLowerCase()

    return items.filter((item) => {
      if (mode === 'owned' && item.quantity <= 0) return false
      if (mode === 'missing' && item.quantity > 0) return false
      if (!normalizedQuery) return true

      const haystack = `${item.printCode} ${item.displayCode} ${item.name} ${item.rarity} ${item.type}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [detail?.items, mode, query])

  const updateQuantity = async (printId: string, delta: number) => {
    if (!detail) return

    const currentItem = detail.items.find((item) => item.id === printId)
    if (!currentItem) return

    const nextLanguageQuantity = currentItem.editableLanguageQuantity + delta
    if (nextLanguageQuantity < 0) return

    setSavingItemId(printId)
    setError(null)

    try {
      await updateCollectionItemQuantity({
        userId: user.id,
        printId,
        languageCode: currentItem.editableLanguageCode,
        nextLanguageQuantity
      })

      setDetail((prev) => {
        if (!prev) return prev

        const nextItems = prev.items.map((item) => {
          if (item.id !== printId) return item

          const nextBreakdownMap = new Map(
            item.languageBreakdown.map((entry) => [entry.languageCode, entry.quantity])
          )

          if (nextLanguageQuantity <= 0) {
            nextBreakdownMap.delete(item.editableLanguageCode)
          } else {
            nextBreakdownMap.set(item.editableLanguageCode, nextLanguageQuantity)
          }

          const nextLanguageBreakdown = [...nextBreakdownMap.entries()].map(([languageCode, quantity]) => ({
            languageCode,
            quantity
          }))

          nextLanguageBreakdown.sort((a, b) => {
            if (a.quantity !== b.quantity) return b.quantity - a.quantity
            if (a.languageCode === 'unknown') return -1
            if (b.languageCode === 'unknown') return 1
            return a.languageCode.localeCompare(b.languageCode)
          })

          const nextEditable = nextLanguageBreakdown[0] || {
            languageCode: 'unknown',
            quantity: 0
          }
          const nextQuantity = nextLanguageBreakdown.reduce((sum, entry) => sum + entry.quantity, 0)

          return {
            ...item,
            quantity: nextQuantity,
            editableLanguageCode: nextEditable.languageCode,
            editableLanguageQuantity: nextEditable.quantity,
            languageBreakdown: nextLanguageBreakdown
          }
        })

        const ownedCount = nextItems.filter((item) => item.quantity > 0).length
        const totalCount = nextItems.length
        const ownedNormal = nextItems.filter((item) => item.quantity > 0 && !item.variantLabel).length
        const ownedAlt = nextItems.filter((item) => item.quantity > 0 && Boolean(item.variantLabel)).length
        const nextSet = {
          ...prev.set,
          stats: {
            ...prev.set.stats,
            owned: ownedCount,
            percent: totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0,
            ownedNormal,
            percentNormal:
              prev.set.stats.totalNormal > 0
                ? Math.round((ownedNormal / prev.set.stats.totalNormal) * 100)
                : 0,
            ownedAlt,
            percentAlt:
              prev.set.stats.totalAlt > 0
                ? Math.round((ownedAlt / prev.set.stats.totalAlt) * 100)
                : 0
          }
        }

        return {
          ...prev,
          set: nextSet,
          ownedCount,
          totalCount,
          items: nextItems
        }
      })
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Erreur mise a jour collection.')
    } finally {
      setSavingItemId(null)
    }
  }

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color="#ea580c" />
        <Text style={styles.centerStateText}>Chargement du set...</Text>
      </View>
    )
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void load('refresh')
          }}
          tintColor="#ea580c"
        />
      }
    >
      <Pressable onPress={onBack} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
        <Text style={styles.backButtonText}>Retour aux sets</Text>
      </Pressable>

      {detail ? (
        <View style={styles.hero}>
          <Image source={{ uri: detail.set.imageUrl }} style={styles.heroImage} resizeMode="contain" />
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroCode}>{detail.set.code}</Text>
            <Text style={styles.heroName}>{detail.set.name}</Text>
            <Text style={styles.heroMeta}>
              {detail.ownedCount} / {detail.totalCount} cartes uniques
            </Text>
          </View>
        </View>
      ) : null}

      {detail ? (
        <View style={styles.summaryCard}>
          <SummaryLine label="Global" value={`${detail.set.stats.percent}%`} color="#ea580c" progress={detail.set.stats.percent} />
          <SummaryLine
            label="Normales"
            value={`${detail.set.stats.ownedNormal} / ${detail.set.stats.totalNormal}`}
            color="#16a34a"
            progress={detail.set.stats.percentNormal}
          />
          <SummaryLine
            label="Alt"
            value={`${detail.set.stats.ownedAlt} / ${detail.set.stats.totalAlt}`}
            color="#7c3aed"
            progress={detail.set.stats.percentAlt}
          />
        </View>
      ) : null}

      <View style={styles.controlsCard}>
        <Text style={styles.controlsLabel}>Rechercher une carte</Text>
        <TextInput
          onChangeText={setQuery}
          placeholder="Code, nom, rarete..."
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={query}
        />
        <View style={styles.segmentRow}>
          <Segment label="Tout" active={mode === 'all'} onPress={() => setMode('all')} />
          <Segment label="Possedees" active={mode === 'owned'} onPress={() => setMode('owned')} />
          <Segment label="Manquantes" active={mode === 'missing'} onPress={() => setMode('missing')} />
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Cartes</Text>
        <Text style={styles.sectionMeta}>{visibleItems.length} visible(s)</Text>
      </View>

      <View style={styles.cardsList}>
        {visibleItems.map((item) => (
          <View key={item.id} style={styles.cardRow}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Text style={styles.cardImagePlaceholderText}>No img</Text>
              </View>
            )}

            <View style={styles.cardInfo}>
              <View style={styles.cardInfoTop}>
                <View style={styles.cardTextBlock}>
                  <Text style={styles.cardCode}>{item.displayCode || item.printCode}</Text>
                  <Text style={styles.cardName}>{item.name}</Text>
                </View>
                <View style={styles.rightControls}>
                  <Pressable
                    onPress={() => {
                      void toggleWishlist(item.id)
                    }}
                    disabled={busyPrintId === item.id}
                    style={({ pressed }) => [
                      styles.wishlistButton,
                      isWishlisted(item.id) ? styles.wishlistButtonActive : null,
                      busyPrintId === item.id ? styles.wishlistButtonDisabled : null,
                      pressed ? styles.wishlistButtonPressed : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.wishlistButtonText,
                        isWishlisted(item.id) ? styles.wishlistButtonTextActive : null
                      ]}
                    >
                      {busyPrintId === item.id ? '...' : isWishlisted(item.id) ? '<3' : '+W'}
                    </Text>
                  </Pressable>
                  <View style={styles.qtyControls}>
                    <Pressable
                      disabled={savingItemId === item.id || item.quantity <= 0}
                      onPress={() => {
                        void updateQuantity(item.id, -1)
                      }}
                      style={({ pressed }) => [
                        styles.qtyButton,
                        (savingItemId === item.id || item.quantity <= 0) ? styles.qtyButtonDisabled : null,
                        pressed ? styles.qtyButtonPressed : null
                      ]}
                    >
                      <Text style={styles.qtyButtonText}>-</Text>
                    </Pressable>
                    <View style={[styles.qtyBadge, item.quantity > 0 ? styles.qtyBadgeOwned : styles.qtyBadgeMissing]}>
                      <Text style={[styles.qtyText, item.quantity > 0 ? styles.qtyTextOwned : styles.qtyTextMissing]}>
                        {savingItemId === item.id ? '...' : item.quantity > 0 ? `x${item.quantity}` : '0'}
                      </Text>
                    </View>
                    <Pressable
                      disabled={savingItemId === item.id}
                      onPress={() => {
                        void updateQuantity(item.id, 1)
                      }}
                      style={({ pressed }) => [
                        styles.qtyButton,
                        savingItemId === item.id ? styles.qtyButtonDisabled : null,
                        pressed ? styles.qtyButtonPressed : null
                      ]}
                    >
                      <Text style={styles.qtyButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.metaRow}>
                {item.rarity ? <MetaPill label={item.rarity} /> : null}
                {item.type ? <MetaPill label={item.type} /> : null}
                {item.variantLabel ? <MetaPill label={item.variantLabel} /> : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

function Segment({
  label,
  active,
  onPress
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentButton,
        active ? styles.segmentButtonActive : null,
        pressed ? styles.segmentButtonPressed : null
      ]}
    >
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  )
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillText}>{label}</Text>
    </View>
  )
}

function SummaryLine({
  label,
  value,
  color,
  progress
}: {
  label: string
  value: string
  color: string
  progress: number
}) {
  return (
    <View style={styles.summaryLine}>
      <View style={styles.summaryHeader}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
      <View style={styles.summaryTrack}>
        <View style={[styles.summaryFill, { backgroundColor: color, width: `${Math.max(0, Math.min(progress, 100))}%` }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24
  },
  centerStateText: {
    color: '#475569',
    fontSize: 15
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  backButtonPressed: {
    opacity: 0.9
  },
  backButtonText: {
    color: '#0f172a',
    fontWeight: '800'
  },
  hero: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    gap: 14
  },
  heroImage: {
    width: 84,
    height: 84,
    borderRadius: 16,
    backgroundColor: '#1f2937'
  },
  heroTextWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 4
  },
  heroCode: {
    color: '#fdba74',
    fontSize: 19,
    fontWeight: '800'
  },
  heroName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700'
  },
  heroMeta: {
    color: '#cbd5e1',
    fontSize: 13
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 14
  },
  summaryLine: {
    gap: 8
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  summaryLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700'
  },
  summaryValue: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800'
  },
  summaryTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden'
  },
  summaryFill: {
    height: '100%',
    borderRadius: 999
  },
  controlsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 10
  },
  controlsLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700'
  },
  searchInput: {
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  segmentButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827'
  },
  segmentButtonPressed: {
    opacity: 0.92
  },
  segmentText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12
  },
  segmentTextActive: {
    color: '#ffffff'
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'baseline'
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800'
  },
  sectionMeta: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700'
  },
  cardsList: {
    gap: 12
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12
  },
  cardImage: {
    width: 74,
    height: 104,
    borderRadius: 14,
    backgroundColor: '#f8fafc'
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardImagePlaceholderText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700'
  },
  cardInfo: {
    flex: 1,
    gap: 10,
    justifyContent: 'center'
  },
  cardInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  cardTextBlock: {
    flex: 1,
    gap: 4
  },
  cardCode: {
    color: '#ea580c',
    fontSize: 13,
    fontWeight: '800'
  },
  cardName: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  qtyBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  rightControls: {
    alignItems: 'flex-end',
    gap: 8
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center'
  },
  qtyButtonDisabled: {
    opacity: 0.45
  },
  qtyButtonPressed: {
    opacity: 0.92
  },
  qtyButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18
  },
  wishlistButton: {
    minWidth: 38,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  wishlistButtonActive: {
    backgroundColor: '#fff1f2',
    borderColor: '#fda4af'
  },
  wishlistButtonDisabled: {
    opacity: 0.7
  },
  wishlistButtonPressed: {
    opacity: 0.92
  },
  wishlistButtonText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800'
  },
  wishlistButtonTextActive: {
    color: '#e11d48'
  },
  qtyBadgeOwned: {
    backgroundColor: '#dcfce7'
  },
  qtyBadgeMissing: {
    backgroundColor: '#f1f5f9'
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '800'
  },
  qtyTextOwned: {
    color: '#166534'
  },
  qtyTextMissing: {
    color: '#64748b'
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  metaPill: {
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  metaPillText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700'
  }
})
