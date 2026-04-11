import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuth } from './src/hooks/useAuth'
import { AuthScreen } from './src/screens/AuthScreen'
import { HomeScreen } from './src/screens/HomeScreen'

export default function App() {
  const { user, loading, signOut } = useAuth()

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {user ? (
        <HomeScreen user={user} onSignOut={signOut} />
      ) : (
        <AuthScreen loading={loading} />
      )}
    </SafeAreaProvider>
  )
}
