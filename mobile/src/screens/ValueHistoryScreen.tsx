import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { fetchCollectionHistory } from '../features/history/service'
import type { HistoryWeekRow } from '../features/history/types'

type SetOption = {
  code: string
  name: string
}

function formatCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency
  }).format(value)
}

function shortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR').format(parsed)
}

function weekLabel(start: string, end: string) {
  return `${shortDate(start)} -> ${shortDate(end)}`
}

export function ValueHistoryScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<HistoryWeekRow[]>([])
  const [selectedSetCode, setSelectedSetCode] = useState('TOTAL')

  const loadHistory = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    if (mode === 'refresh') setRefreshing(true)
    setError(null)

    try {
      const payload = await fetchCollectionHistory()
      setWeeks(Array.isArray(payload?.weeks) ? payload.weeks : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erreur chargement historique.')
      setWeeks([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  const setOptions = useMemo<SetOption[]>(() => {
    const map = new Map<string, string>()
    for (const week of weeks) {
      for (const row of week.sets) {
        if (!map.has(row.setCode)) {
          map.set(row.setCode, row.setName || row.setCode)
        }
      }
    }
    return [...map.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [weeks])

  const selectedSetLabel =
    selectedSetCode === 'TOTAL'
      ? 'Collection complete'
      : setOptions.find((row) => row.code === selectedSetCode)?.name || selectedSetCode

  const series = useMemo(
    () =>
      weeks.map((week) => ({
        periodStart: week.periodStart,
        periodEnd: week.periodEnd,
        value:
          selectedSetCode === 'TOTAL'
            ? week.total?.value || 0
            : week.sets.find((row) => row.setCode === selectedSetCode)?.value || 0,
        pricedCount:
          selectedSetCode === 'TOTAL'
            ? week.total?.pricedCount || 0
            : week.sets.find((row) => row.setCode === selectedSetCode)?.pricedCount || 0,
        expectedCount:
          selectedSetCode === 'TOTAL'
            ? week.total?.expectedCount || 0
            : week.sets.find((row) => row.setCode === selectedSetCode)?.expectedCount || 0,
        currency: week.total?.currency || 'EUR'
      })),
    [selectedSetCode, weeks]
  )

  const latest = series[series.length - 1] || null
  const first = series[0] || null
  const delta = latest && first ? latest.value - first.value : 0
  const maxValue = Math.max(1, ...series.map((row) => row.value))

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator color="#1d4ed8" />
        <Text style={styles.centerStateText}>Chargement suivi valeur...</Text>
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
            void loadHistory('refresh')
          }}
          tintColor="#1d4ed8"
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>Valeur</Text>
        <Text style={styles.title}>Snapshots hebdomadaires de ta collection.</Text>
        <Text style={styles.subtitle}>
          La date affichee correspond a la fin de semaine du snapshot, pas au debut.
        </Text>
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}>Vue active</Text>
        <View style={styles.pillWrap}>
          <FilterPill
            label="Collection complete"
            active={selectedSetCode === 'TOTAL'}
            onPress={() => setSelectedSetCode('TOTAL')}
          />
          {setOptions.map((option) => (
            <FilterPill
              key={option.code}
              label={option.code}
              active={selectedSetCode === option.code}
              onPress={() => setSelectedSetCode(option.code)}
            />
          ))}
        </View>
        <Text style={styles.filterHelper}>Vue: {selectedSetLabel}</Text>
      </View>

      {latest ? (
        <View style={styles.summaryGrid}>
          <SummaryCard
            label="Dernier snapshot"
            value={formatCurrency(latest.value, latest.currency)}
          />
          <SummaryCard label="Delta total" value={formatSignedCurrency(delta, latest.currency)} />
          <SummaryCard label="Semaines" value={String(series.length)} />
          <SummaryCard
            label="Couverture"
            value={`${latest.pricedCount}/${latest.expectedCount}`}
          />
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Historique</Text>
        <Text style={styles.sectionMeta}>{series.length} snapshot(s)</Text>
      </View>

      {series.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Aucun snapshot disponible</Text>
          <Text style={styles.emptyBody}>
            L&apos;historique apparaitra ici des qu&apos;un snapshot hebdomadaire sera enregistre.
          </Text>
        </View>
      ) : (
        <View style={styles.cardsList}>
          {[...series].reverse().map((row) => {
            const barWidth = `${Math.max(8, Math.round((row.value / maxValue) * 100))}%` as `${number}%`
            return (
              <View key={`${row.periodStart}-${selectedSetCode}`} style={styles.weekCard}>
                <View style={styles.weekHeader}>
                  <View style={styles.weekTextWrap}>
                    <Text style={styles.weekTitle}>Snapshot du {shortDate(row.periodEnd)}</Text>
                    <Text style={styles.weekRange}>{weekLabel(row.periodStart, row.periodEnd)}</Text>
                  </View>
                  <Text style={styles.weekValue}>{formatCurrency(row.value, row.currency)}</Text>
                </View>

                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: barWidth }]} />
                </View>

                <View style={styles.weekFooter}>
                  <Text style={styles.weekFooterText}>
                    Cartes pricees: {row.pricedCount}/{row.expectedCount}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}

function formatSignedCurrency(value: number, currency = 'EUR') {
  const formatted = formatCurrency(Math.abs(value), currency)
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  )
}

function FilterPill({
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
        styles.filterPill,
        active ? styles.filterPillActive : null,
        pressed ? styles.filterPillPressed : null
      ]}
    >
      <Text style={[styles.filterPillText, active ? styles.filterPillTextActive : null]}>
        {label}
      </Text>
    </Pressable>
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
    backgroundColor: '#0f172a',
    borderRadius: 28,
    padding: 22,
    gap: 10
  },
  kicker: {
    color: '#93c5fd',
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
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22
  },
  filterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbeafe',
    padding: 16,
    gap: 10
  },
  filterLabel: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700'
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterPillActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8'
  },
  filterPillPressed: {
    opacity: 0.92
  },
  filterPillText: {
    color: '#1e3a8a',
    fontSize: 12,
    fontWeight: '800'
  },
  filterPillTextActive: {
    color: '#ffffff'
  },
  filterHelper: {
    color: '#334155',
    fontSize: 13
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  summaryCard: {
    flexGrow: 1,
    minWidth: '47%',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 6
  },
  summaryValue: {
    color: '#1d4ed8',
    fontSize: 20,
    fontWeight: '800'
  },
  summaryLabel: {
    color: '#1e3a8a',
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
    gap: 12
  },
  weekCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start'
  },
  weekTextWrap: {
    flex: 1,
    gap: 4
  },
  weekTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800'
  },
  weekRange: {
    color: '#64748b',
    fontSize: 12
  },
  weekValue: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '800'
  },
  barTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    overflow: 'hidden'
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563eb'
  },
  weekFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  weekFooterText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600'
  }
})
