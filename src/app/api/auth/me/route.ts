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
 * Body: { "profile_photo": "/uploads/xxx.png" | null }
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

    // If a string is provided, it must be a relative /uploads/ path
    // to prevent storing arbitrary external URLs.
    if (typeof profile_photo === 'string' && profile_photo.length > 0) {
      if (!profile_photo.startsWith('/uploads/')) {
        return NextResponse.json(
          { error: 'Caminho de foto inválido' },
          { status: 400 }
        );
      }
      // Limit length to prevent abuse
      if (profile_photo.length > 255) {
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
