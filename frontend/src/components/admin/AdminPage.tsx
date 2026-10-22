import { useEffect, useState } from 'react';
import { useProfile } from '../../lib/useProfile';
import { api } from '../../services/api';
import Button from '../ui/Button';
import SectionHeading from '../ui/SectionHeading';

/* ==========================================================================
   Página de administración: gestión de usuarios.
   Solo accesible para usuarios con rol 'admin'.
   ========================================================================== */

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPage() {
  const { isAdmin } = useProfile();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
  }, [isAdmin]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.get<AdminUser[]>('/admin/users');
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.put(`/admin/users/${userId}`, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando rol');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (
      !confirm(
        '¿Eliminar este usuario? Se cancela su suscripción en Stripe, se borra su cuenta de Clerk y todos sus datos. No se puede deshacer.',
      )
    )
      return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error eliminando usuario');
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center">
        <p className="text-rose-200">No tenés permiso para acceder a esta página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeading
        overline="Administración"
        title="Gestión de usuarios"
        subtitle="Administra los usuarios de la aplicación: cambia roles o elimina cuentas."
      />

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center">
          <p className="text-gold-100/50">Cargando usuarios…</p>
        </div>
      ) : (
        <div className="space-y-4">
          {users.length === 0 ? (
            <p className="text-center text-gold-100/50">No hay usuarios registrados.</p>
          ) : (
            <div className="grid gap-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="panel gilded flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name ?? user.email}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold-400/30 bg-ink-900 text-gold-300">
                        {user.email.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <p className="text-sm text-gold-100">{user.name ?? 'Sin nombre'}</p>
                      <p className="text-xs text-gold-100/50">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:ml-auto">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="rounded-lg border border-gold-400/25 bg-ink-900/70 px-3 py-1.5 text-sm text-gold-100"
                    >
                      <option value="user">Usuario</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
