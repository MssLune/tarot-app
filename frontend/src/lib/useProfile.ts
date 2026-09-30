import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { api } from '../services/api';

/* ==========================================================================
   Perfil del usuario autenticado.

   El rol se lee de la API (`GET /api/user/me`) y no de los claims de Clerk:
   la tabla `users` es la fuente de verdad, así el panel puede dar de alta un
   admin sin tocar el dashboard de Clerk. Mientras no responda, `role` es
   'user' para no mostrar controles de admin que el backend va a rechazar.
   ========================================================================== */

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  createdAt: string;
}

export function useProfile() {
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setProfile(null);
      return;
    }
    try {
      setLoading(true);
      const data = await api.get<Profile>('/user/me');
      setProfile(data);
    } catch {
      // Si falla, nos quedamos sin perfil: se trata como usuario normal y la
      // UI no ofrece acciones que el backend fuese a rechazar con 403.
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (isAuthLoaded) void refresh();
  }, [isAuthLoaded, refresh]);

  return {
    profile,
    isAdmin: profile?.role === 'admin',
    loading,
    refresh,
  };
}
