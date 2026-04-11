import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { User } from '@supabase/supabase-js'
import { useWishlist } from '../hooks/useWishlist'
import {
  buildCardmarketProductOrSearchUrl,
  fetchWishlistItems
} from '../features/wishlist/service'
import type { WishlistItem } from '../features/wishlist/types'

type Props = {
  user: User
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value * 100)}%`
}

export function WishlistScreen({ user }: Props) {
  const { wishlistIds, toggleWishlist, busyPrintId, loading: wishlistLoading } = useWishlist(user.id)
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadWishlist = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    if (mode === 'refresh') setRefreshing(true)
    setError(null)

    try {
      const nextItems = await fetchWishlistItems(user.id)
      setItems(nextItems)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erreur chargement wishlist.')
      setItems([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!wishlistLoading) {
      void loadWishlist()
    }
  }, [wishlistIds, wishlistLoading, user.id])

  const groupedItems = useMemo(() => {
    const grouped = new Map<string, WishlistItem[]>()
    for (const item of items) {
      if (!grouped.has(item.setCode)) grouped.set(item.setCode, [])
      grouped.get(item.setCode)?.push(item)
    }
    return [...grouped.entries()]
  }, [items])

  if (loading || wishlistLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color="#db2777" />
        <Text style={styles.centerStateText}>Chargement wishlist...</Text>
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
            void loadWishlist('refresh')
          }}
          tintColor="#db2777"
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>Wishlist</Text>
        <Text style={styles.title}>Tes cartes ciblees, avec prix et tendance.</Text>
        <Text style={styles.subtitle}>
          Retire rapidement une carte de la wishlist ou ouvre Cardmarket directement depuis l&apos;app.
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Cartes suivies" value={String(items.length)} />
        <SummaryCard
          label="Avec prix"
          value={String(items.filter((item) => item.price != null).length)}
        />
        <SummaryCard
          label="En baisse"
          value={String(items.filter((item) => item.trendDirection === 'down').length)}
        />
        <SummaryCard
          label="Sets"
          value={String(new Set(items.map((item) => item.setCode)).size)}
        />
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Wishlist vide</Text>
          <Text style={styles.emptyBody}>
            Ajoute des cartes depuis le detail d&apos;un set avec le coeur pour les retrouver ici.
          </Text>
        </View>
      ) : (
        groupedItems.map(([setCode, setItems]) => (
          <View key={setCode} style={styles.setSection}>
            <View style={styles.setHeader}>
              <View>
                <Text style={styles.setCode}>{setCode}</Text>
                <Text style={styles.setName}>{setItems[0]?.setName || setCode}</Text>
              </View>
              <Text style={styles.setCount}>{setItems.length} carte(s)</Text>
            </View>

            <View style={styles.cardsList}>
              {setItems.map((item) => (
                <View key={item.id} style={styles.cardRow}>
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                      <Text style={styles.cardImagePlaceholderText}>No img</Text>
                    </View>
                  )}

                  <View style={styles.cardInfo}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTextWrap}>
                        <Text style={styles.cardCode}>{item.displayCode || item.printCode}</Text>
                        <Text style={styles.cardName}>{item.name}</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          void toggleWishlist(item.id)
                        }}
                        disabled={busyPrintId === item.id}
                        style={({ pressed }) => [
                          styles.heartButton,
                          busyPrintId === item.id ? styles.heartButtonDisabled : null,
                          pressed ? styles.heartButtonPressed : null
                        ]}
                      >
                        <Text style={styles.heartButtonText}>
                          {busyPrintId === item.id ? '...' : '<3'}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={styles.metaRow}>
                      {item.rarity ? <MetaPill label={item.rarity} /> : null}
                      {item.type ? <MetaPill label={item.type} /> : null}
                      {item.variantLabel ? <MetaPill label={item.variantLabel} /> : null}
                    </View>

                    <View style={styles.statsRow}>
                      <Text style={styles.statText}>
                        Prix: <Text style={styles.statStrong}>{item.price != null ? formatCurrency(item.price) : '-'}</Text>
                      </Text>
                      <Text
                        style={[
                          styles.statText,
                          item.trendDirection === 'down'
                            ? styles.trendDown
                            : item.trendDirection === 'up'
                              ? styles.trendUp
                              : null
                        ]}
                      >
                        Tendance:{' '}
                        <Text style={styles.statStrong}>
                          {item.trendScore != null ? formatPercent(item.trendScore) : '-'}
                        </Text>
                      </Text>
                      <Text style={styles.statText}>
                        Indice:{' '}
                        <Text style={[styles.statStrong, styles.interestValue]}>
                          {item.interestIndex != null ? item.interestIndex.toFixed(1) : '-'}
                        </Text>
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        void Linking.openURL(
                          buildCardmarketProductOrSearchUrl({
                            productId: item.cardmarketProductId,
                            search: item.printCode.split('_')[0] || item.name
                          })
                        )
                      }}
                      style={({ pressed }) => [
                        styles.linkButton,
                        pressed ? styles.linkButtonPressed : null
                      ]}
                    >
                      <Text style={styles.linkButtonText}>Ouvrir Cardmarket</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function MetaPill({ label }: { label: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillText}>{label}</Text>
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
  hero: {
    backgroundColor: '#4a044e',
    borderRadius: 28,
    padding: 22,
    gap: 10
  },
  kicker: {
    color: '#f9a8d4',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34
  },
  subtitle: {
    color: '#f5d0fe',
    fontSize: 15,
    lineHeight: 22
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: '47%',
    backgroundColor: '#fdf2f8',
    borderColor: '#fbcfe8',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 6
  },
  summaryValue: {
    color: '#be185d',
    fontSize: 20,
    fontWeight: '800'
  },
  summaryLabel: {
    color: '#9d174d',
    fontSize: 13,
    fontWeight: '700'
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
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 18,
    gap: 8
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800'
  },
  emptyBody: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21
  },
  setSection: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 16,
    gap: 14
  },
  setHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'baseline'
  },
  setCode: {
    color: '#be185d',
    fontSize: 18,
    fontWeight: '800'
  },
  setName: {
    color: '#475569',
    fontSize: 13
  },
  setCount: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700'
  },
  cardsList: {
    gap: 12
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#fffafc',
    borderWidth: 1,
    borderColor: '#f3e8ff',
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  cardTextWrap: {
    flex: 1,
    gap: 4
  },
  cardCode: {
    color: '#db2777',
    fontSize: 13,
    fontWeight: '800'
  },
  cardName: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  heartButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fda4af',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heartButtonDisabled: {
    opacity: 0.7
  },
  heartButtonPressed: {
    opacity: 0.92
  },
  heartButtonText: {
    color: '#e11d48',
    fontWeight: '800'
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
  },
  statsRow: {
    gap: 4
  },
  statText: {
    color: '#475569',
    fontSize: 12
  },
  statStrong: {
    color: '#0f172a',
    fontWeight: '800'
  },
  trendDown: {
    color: '#dc2626'
  },
  trendUp: {
    color: '#15803d'
  },
  interestValue: {
    color: '#7c3aed'
  },
  linkButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fdf2f8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  linkButtonPressed: {
    opacity: 0.92
  },
  linkButtonText: {
    color: '#9d174d',
    fontWeight: '800'
  }
})
