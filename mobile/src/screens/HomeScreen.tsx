import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { User } from '@supabase/supabase-js'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { CollectionScreen } from './CollectionScreen'
import { ValueHistoryScreen } from './ValueHistoryScreen'
import { WishlistScreen } from './WishlistScreen'

type Props = {
  user: User
  onSignOut: () => Promise<void>
}

type ProfileRow = {
  username: string | null
  discord_username: string | null
}

export function HomeScreen({ user, onSignOut }: Props) {
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [tab, setTab] = useState<'collection' | 'value' | 'wishlist' | 'account'>('collection')

  useEffect(() => {
    let alive = true

    const loadProfile = async () => {
      setLoadingProfile(true)
      const { data } = await supabase
        .from('profiles')
        .select('username, discord_username')
        .eq('id', user.id)
        .maybeSingle()

      if (!alive) return
      setProfile((data as ProfileRow | null) || null)
      setLoadingProfile(false)
    }

    void loadProfile()

    return () => {
      alive = false
    }
  }, [user.id])

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.tabsWrap}>
        <Pressable
          onPress={() => setTab('collection')}
          style={({ pressed }) => [
            styles.tabButton,
            tab === 'collection' ? styles.tabButtonActive : null,
            pressed ? styles.tabButtonPressed : null
          ]}
        >
          <Text style={[styles.tabLabel, tab === 'collection' ? styles.tabLabelActive : null]}>
            Collection
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('value')}
          style={({ pressed }) => [
            styles.tabButton,
            tab === 'value' ? styles.tabButtonActive : null,
            pressed ? styles.tabButtonPressed : null
          ]}
        >
          <Text style={[styles.tabLabel, tab === 'value' ? styles.tabLabelActive : null]}>
            Valeur
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('wishlist')}
          style={({ pressed }) => [
            styles.tabButton,
            tab === 'wishlist' ? styles.tabButtonActive : null,
            pressed ? styles.tabButtonPressed : null
          ]}
        >
          <Text style={[styles.tabLabel, tab === 'wishlist' ? styles.tabLabelActive : null]}>
            Wishlist
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('account')}
          style={({ pressed }) => [
            styles.tabButton,
            tab === 'account' ? styles.tabButtonActive : null,
            pressed ? styles.tabButtonPressed : null
          ]}
        >
          <Text style={[styles.tabLabel, tab === 'account' ? styles.tabLabelActive : null]}>
            Compte
          </Text>
        </Pressable>
      </View>

      {tab === 'collection' ? (
        <CollectionScreen user={user} />
      ) : tab === 'value' ? (
        <ValueHistoryScreen />
      ) : tab === 'wishlist' ? (
        <WishlistScreen user={user} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>Mobile beta</Text>
            <Text style={styles.title}>Connexion reussie a la base Supabase.</Text>
            <Text style={styles.subtitle}>
              La collection mobile est maintenant branchee. Cet onglet garde la partie compte et
              session.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Compte</Text>
            <InfoRow label="Email" value={user.email || '-'} />
            {loadingProfile ? (
              <View style={styles.loaderRow}>
                <ActivityIndicator color="#ea580c" />
                <Text style={styles.loaderText}>Chargement du profil...</Text>
              </View>
            ) : (
              <>
                <InfoRow label="Pseudo" value={profile?.username || '-'} />
                <InfoRow label="Discord" value={profile?.discord_username || '-'} />
                <InfoRow label="User ID" value={user.id} />
              </>
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Suite mobile</Text>
            <Text style={styles.todoItem}>Ajouter le detail d&apos;un set avec les cartes possedees.</Text>
            <Text style={styles.todoItem}>Ajouter les ecrans wishlist et valeur au meme niveau de finition.</Text>
            <Text style={styles.todoItem}>Ajouter plus d&apos;actions collection directement dans l&apos;app.</Text>
          </View>

          <Pressable
            onPress={() => {
              void onSignOut()
            }}
            style={({ pressed }) => [styles.signOutButton, pressed ? styles.signOutButtonPressed : null]}
          >
            <Text style={styles.signOutText}>Se deconnecter</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  tabsWrap: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 12
  },
  tabButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827'
  },
  tabButtonPressed: {
    opacity: 0.92
  },
  tabLabel: {
    color: '#334155',
    fontWeight: '800'
  },
  tabLabelActive: {
    color: '#ffffff'
  },
  content: {
    padding: 20,
    gap: 16
  },
  hero: {
    backgroundColor: '#0f172a',
    borderRadius: 28,
    padding: 22,
    gap: 10
  },
  kicker: {
    color: '#fda4af',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  panelTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800'
  },
  infoRow: {
    gap: 6
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 15,
    lineHeight: 21
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  loaderText: {
    color: '#475569'
  },
  todoItem: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 22
  },
  signOutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    borderRadius: 18,
    minHeight: 54
  },
  signOutButtonPressed: {
    opacity: 0.9
  },
  signOutText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  }
})
