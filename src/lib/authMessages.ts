export function getAuthErrorMessage(message: string | null | undefined) {
  const normalized = String(message || '').trim().toLowerCase()
  const rawMessage = String(message || '').trim()

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

  if (
    normalized.includes('same email') ||
    normalized.includes('same verified email') ||
    normalized.includes('email does not match') ||
    normalized.includes('emails do not match') ||
    normalized.includes('email mismatch') ||
    normalized.includes('can only link') ||
    normalized.includes('link accounts with the same')
  ) {
    return "La liaison a ete refusee. Le compte Google doit utiliser la meme adresse email que ton compte actuel."
  }

  if (
    normalized.includes('identity already exists') ||
    normalized.includes('already been registered') ||
    normalized.includes('account already exists') ||
    normalized.includes('already linked to another user')
  ) {
    return "Ce compte Google semble deja rattache a un autre compte. Connecte-toi avec Google ou utilise un autre compte Google."
  }

  if (normalized.includes('user not found') || normalized.includes('session_not_found')) {
    return "Ta session a expire. Recharge la page puis reconnecte-toi avant de lier Google."
  }

  if (normalized.includes('oauth') && normalized.includes('state')) {
    return "La tentative de liaison a expire. Reessaie depuis la page compte."
  }

  if (rawMessage) {
    return `Impossible de terminer l'action pour le moment. Detail: ${rawMessage}`
  }

  return "Impossible de terminer l'action pour le moment."
}
