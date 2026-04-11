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
import { fetchCollectionDashboard } from '../features/collection/service'
import type { CollectionOverview, CollectionSetCard } from '../features/collection/types'
import { CollectionSetDetailScreen } from './CollectionSetDetailScreen'

type Props = {
  user: User
}

export function CollectionScreen({ user }: Props) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [overview, setOverview] = useState<CollectionOverview | null>(null)
  const [sets, setSets] = useState<CollectionSetCard[]>([])
  const [selectedSetCode, setSelectedSetCode] = useState<string | null>(null)

  const loadCollection = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    if (mode === 'refresh') setRefreshing(true)
    setError(null)

    try {
      const data = await fetchCollectionDashboard(user.id)
      setOverview(data.overview)
      setSets(data.sets)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erreur chargement collection.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadCollection()
  }, [user.id])

  const filteredSets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return sets
    return sets.filter((set) => {
      const haystack = `${set.code} ${set.name}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [query, sets])

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color="#ea580c" />
        <Text style={styles.centerStateText}>Chargement de ta collection...</Text>
      </View>
    )
  }

  if (selectedSetCode) {
    return (
      <CollectionSetDetailScreen
        user={user}
        setCode={selectedSetCode}
        onBack={() => {
          setSelectedSetCode(null)
          void loadCollection('refresh')
        }}
      />
    )
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void loadCollection('refresh')
          }}
          tintColor="#ea580c"
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>Collection</Text>
        <Text style={styles.title}>Tes sets One Piece, en direct depuis la base.</Text>
        <Text style={styles.subtitle}>
          Progression globale, normales, alternatives, et refresh mobile en un geste.
        </Text>
      </View>

      {overview ? (
        <View style={styles.summaryGrid}>
          <SummaryCard label="Sets suivis" value={String(overview.ownedSetsCount)} />
          <SummaryCard label="Cartes uniques" value={String(overview.totalTrackedCards)} />
          <SummaryCard label="Cartes possedees" value={String(overview.totalOwnedCards)} />
          <SummaryCard label="Progression" value={`${overview.overallPercent}%`} />
        </View>
      ) : null}

      <View style={styles.searchCard}>
        <Text style={styles.searchLabel}>Rechercher un set</Text>
        <TextInput
          onChangeText={setQuery}
          placeholder="Ex: OP05, PRB01, Heroines..."
          placeholderTextColor="#94a3b8"
          style={styles.searchInput}
          value={query}
        />
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => {
              void loadCollection()
            }}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.retryButtonPressed : null]}
          >
            <Text style={styles.retryButtonText}>Recharger</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Mes sets</Text>
        <Text style={styles.sectionMeta}>{filteredSets.length} visible(s)</Text>
      </View>

      {filteredSets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Aucun set a afficher</Text>
          <Text style={styles.emptyBody}>
            Ajoute des cartes sur le site web ou modifie la recherche pour les retrouver ici.
          </Text>
        </View>
      ) : (
        <View style={styles.cardsList}>
          {filteredSets.map((set) => (
            <Pressable
              key={set.id}
              onPress={() => setSelectedSetCode(set.code)}
              style={({ pressed }) => [styles.setCard, pressed ? styles.setCardPressed : null]}
            >
              <View style={styles.cardTopRow}>
                <Image source={{ uri: set.imageUrl }} style={styles.setImage} resizeMode="contain" />
                <View style={styles.setMeta}>
                  <Text style={styles.setCode}>{set.code}</Text>
                  <Text style={styles.setName}>{set.name}</Text>
                  <Text style={styles.setOwnedText}>
                    {set.stats.owned} / {set.stats.total} cartes uniques
                  </Text>
                </View>
              </View>

              <ProgressRow
                label="Global"
                value={`${set.stats.percent}%`}
                progress={set.stats.percent}
                color="#ea580c"
              />
              <ProgressRow
                label="Normales"
                value={`${set.stats.ownedNormal} / ${set.stats.totalNormal}`}
                progress={set.stats.percentNormal}
                color="#16a34a"
              />
              <ProgressRow
                label="Alt"
                value={`${set.stats.ownedAlt} / ${set.stats.totalAlt}`}
                progress={set.stats.percentAlt}
                color="#7c3aed"
              />
            </Pressable>
          ))}
        </View>
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

function ProgressRow({
  label,
  value,
  progress,
  color
}: {
  label: string
  value: string
  progress: number
  color: string
}) {
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{value}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(progress, 100))}%`, backgroundColor: color }]} />
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
  hero: {
    backgroundColor: '#111827',
    borderRadius: 28,
    padding: 22,
    gap: 10
  },
  kicker: {
    color: '#fdba74',
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
    color: '#d1d5db',
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
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 6
  },
  summaryValue: {
    color: '#9a3412',
    fontSize: 24,
    fontWeight: '800'
  },
  summaryLabel: {
    color: '#7c2d12',
    fontSize: 13,
    fontWeight: '700'
  },
  searchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 8
  },
  searchLabel: {
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
  errorCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 14,
    lineHeight: 20
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  retryButtonPressed: {
    opacity: 0.9
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '800'
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10
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
  cardsList: {
    gap: 14
  },
  setCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 16,
    gap: 14
  },
  setCardPressed: {
    opacity: 0.95
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 14
  },
  setImage: {
    width: 88,
    height: 88,
    borderRadius: 16,
    backgroundColor: '#f8fafc'
  },
  setMeta: {
    flex: 1,
    gap: 4,
    justifyContent: 'center'
  },
  setCode: {
    color: '#ea580c',
    fontSize: 18,
    fontWeight: '800'
  },
  setName: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700'
  },
  setOwnedText: {
    color: '#64748b',
    fontSize: 13
  },
  progressBlock: {
    gap: 8
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  progressLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700'
  },
  progressValue: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800'
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 999
  }
})
