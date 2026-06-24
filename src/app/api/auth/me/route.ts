import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { getUserSchoolIdsList } from '@/lib/user-schools';
import { logAction } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        status: true,
        profile_photo: true,
        two_factor_enabled: true,
        must_change_password: true,
        last_login: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Include the list of schools the user can access (empty array for Admins)
    const school_ids = await getUserSchoolIdsList(user.id, user.role);

    return NextResponse.json({ user: { ...user, school_ids } });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/auth/me
 * Allows any authenticated user (Admin, Operator, Viewer) to update
 * their own profile photo. This is the self-service endpoint used by
 * the "Meu Perfil" dialog in the sidebar user dropdown.
 *
 * Body: { "profile_photo": "data:image/...;base64,..." | "/uploads/xxx.png" | null }
 *
 * NOTE: On Vercel the filesystem is read-only, so uploaded images are stored
 * as base64 data URLs (produced by /api/upload). Postgres TOAST handles the
 * large text value transparently, and <img src="data:..."> renders in every
 * browser. Legacy "/uploads/..." paths are still accepted for backwards
 * compatibility with local dev environments.
 */
export const PUT = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const { profile_photo } = body;

    // Validate profile_photo — must be a string URL or null
    if (profile_photo !== null && typeof profile_photo !== 'string') {
      return NextResponse.json(
        { error: 'profile_photo deve ser uma string ou null' },
        { status: 400 }
      );
    }

    // If a string is provided, it must be either:
    //  (a) a base64 data URL of an allowed image type, or
    //  (b) a legacy relative /uploads/ path.
    // This prevents storing arbitrary external URLs (SSRF / data exfiltration).
    if (typeof profile_photo === 'string' && profile_photo.length > 0) {
      const isDataUrl = profile_photo.startsWith('data:image/');
      const isUploadPath = profile_photo.startsWith('/uploads/');

      if (!isDataUrl && !isUploadPath) {
        return NextResponse.json(
          { error: 'Foto inválida. Envie uma imagem válida.' },
          { status: 400 }
        );
      }

      // For data URLs, validate the mime prefix is one we allow, and cap the
      // length to protect the database from abuse.
      if (isDataUrl) {
        const mimeMatch = profile_photo.match(/^data:image\/([a-z]+);base64,/i);
        if (!mimeMatch || !['jpeg', 'png', 'jpg', 'webp'].includes(mimeMatch[1].toLowerCase())) {
          return NextResponse.json(
            { error: 'Tipo de imagem não permitido' },
            { status: 400 }
          );
        }
        if (profile_photo.length > 6 * 1024 * 1024) {
          return NextResponse.json(
            { error: 'Imagem muito grande. Use uma imagem menor.' },
            { status: 400 }
          );
        }
      } else if (profile_photo.length > 255) {
        // Legacy /uploads/ path — keep the tight length cap.
        return NextResponse.json(
          { error: 'Caminho de foto muito longo' },
          { status: 400 }
        );
      }
    }

    const userId = req.user!.userId;

    const updated = await db.user.update({
      where: { id: userId },
      data: { profile_photo: profile_photo || null },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        status: true,
        profile_photo: true,
        two_factor_enabled: true,
        must_change_password: true,
        last_login: true,
        created_at: true,
        updated_at: true,
      },
    });

    await logAction(
      userId,
      'update_profile_photo',
      'Foto de perfil atualizada',
      req
    );

    const school_ids = await getUserSchoolIdsList(updated.id, updated.role);

    return NextResponse.json({ user: { ...updated, school_ids } });
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
