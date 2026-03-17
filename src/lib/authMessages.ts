export function getAuthErrorMessage(message: string | null | undefined) {
  const normalized = String(message || '').trim().toLowerCase()

  if (!normalized) {
    return "Une erreur d'authentification est survenue."
  }

  if (normalized.includes('invalid login credentials')) {
    return "Email ou mot de passe incorrect."
  }

  if (normalized.includes('email not confirmed')) {
    return "Ton email n'est pas encore confirme. Verifie ta boite mail."
  }

  if (normalized.includes('user already registered')) {
    return 'Un compte existe deja avec cet email.'
  }

  if (normalized.includes('password should be at least 6 characters')) {
    return 'Le mot de passe doit contenir au moins 6 caracteres.'
  }

  if (normalized.includes('unable to validate email address')) {
    return "L'adresse email semble invalide."
  }

  if (normalized.includes('for security purposes')) {
    return 'Trop de tentatives. Reessaie dans quelques instants.'
  }

  if (normalized.includes('email rate limit exceeded')) {
    return "Trop d'emails envoyes. Attends un peu avant de reessayer."
  }

  if (normalized.includes('provider is not enabled')) {
    return 'Ce mode de connexion nest pas encore active.'
  }

  if (normalized.includes('identity is already linked')) {
    return 'Ce compte externe est deja lie.'
  }

  return "Impossible de terminer l'action pour le moment."
}
