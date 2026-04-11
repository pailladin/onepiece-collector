import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'

type Props = {
  loading: boolean
}

export function AuthScreen({ loading }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const siteUrl = process.env.EXPO_PUBLIC_SITE_URL

  const handleSubmit = async () => {
    setSubmitting(true)
    setMessage(null)

    const cleanEmail = email.trim()
    const cleanPassword = password

    try {
      if (!cleanEmail || !cleanPassword) {
        setMessage('Renseigne ton email et ton mot de passe.')
        return
      }

      if (mode === 'forgot') {
        if (!siteUrl) {
          setMessage('Le lien de reinitialisation n est pas configure dans l app.')
          return
        }

        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${siteUrl}/auth?type=recovery`
        })
        if (error) throw error
        setMessage('Email envoye. Verifie ta boite mail pour reinitialiser ton mot de passe.')
        return
      }

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword
        })
        if (error) throw error
        return
      }

      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword
      })
      if (error) throw error
      setMessage('Compte cree. Verifie ton email si une confirmation est requise.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur de connexion.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.shell}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>One Piece Collector</Text>
            <Text style={styles.title}>Ton compte dans une app mobile connectee a Supabase.</Text>
            <Text style={styles.subtitle}>
              On pose ici une base saine pour l&apos;auth, la session persistante et les futurs
              ecrans collection.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Pressable
                onPress={() => setMode('signin')}
                style={[
                  styles.switchButton,
                  mode === 'signin' && styles.switchButtonActive
                ]}
              >
                <Text
                  style={[styles.switchLabel, mode === 'signin' && styles.switchLabelActive]}
                >
                  Connexion
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('signup')}
                style={[styles.switchButton, mode === 'signup' && styles.switchButtonActive]}
              >
                <Text
                  style={[styles.switchLabel, mode === 'signup' && styles.switchLabelActive]}
                >
                  Inscription
                </Text>
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              value={email}
            />

            {mode !== 'forgot' ? (
              <View style={styles.passwordRow}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  onChangeText={setPassword}
                  placeholder="Mot de passe"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                />
                <Pressable
                  onPress={() => setShowPassword((current) => !current)}
                  style={({ pressed }) => [
                    styles.passwordToggle,
                    pressed ? styles.passwordTogglePressed : null
                  ]}
                >
                  <Text style={styles.passwordToggleText}>
                    {showPassword ? 'Masquer' : 'Voir'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helperText}>
                On va t envoyer un lien sur le site pour choisir un nouveau mot de passe.
              </Text>
            )}

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Pressable
              disabled={loading || submitting}
              onPress={() => {
                void handleSubmit()
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                (loading || submitting) && styles.primaryButtonDisabled,
                pressed && !(loading || submitting) ? styles.primaryButtonPressed : null
              ]}
            >
              {loading || submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'signin'
                    ? 'Se connecter'
                    : mode === 'signup'
                      ? 'Creer un compte'
                      : 'Envoyer le lien'}
                </Text>
              )}
            </Pressable>

            {mode === 'signin' ? (
              <Pressable
                onPress={() => {
                  setMessage(null)
                  setMode('forgot')
                }}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>Mot de passe oublie ?</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setMessage(null)
                  setMode('signin')
                }}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>Retour a la connexion</Text>
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff7ed'
  },
  flex: {
    flex: 1
  },
  shell: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
    backgroundColor: '#fff7ed'
  },
  hero: {
    gap: 10
  },
  eyebrow: {
    color: '#c2410c',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#fed7aa',
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    shadowColor: '#9a3412',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3
  },
  switchRow: {
    flexDirection: 'row',
    backgroundColor: '#ffedd5',
    borderRadius: 16,
    padding: 4
  },
  switchButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10
  },
  switchButtonActive: {
    backgroundColor: '#ffffff'
  },
  switchLabel: {
    color: '#9a3412',
    fontWeight: '700'
  },
  switchLabelActive: {
    color: '#111827'
  },
  input: {
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  passwordRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  passwordInput: {
    flex: 1
  },
  passwordToggle: {
    minWidth: 72,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    backgroundColor: '#fff'
  },
  passwordTogglePressed: {
    opacity: 0.92
  },
  passwordToggleText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13
  },
  message: {
    color: '#9a3412',
    fontSize: 14,
    lineHeight: 20
  },
  helperText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#ea580c',
    borderRadius: 16,
    minHeight: 52,
    justifyContent: 'center'
  },
  primaryButtonDisabled: {
    opacity: 0.7
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.99 }]
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryAction: {
    alignItems: 'center',
    paddingVertical: 6
  },
  secondaryActionText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '700'
  }
})
