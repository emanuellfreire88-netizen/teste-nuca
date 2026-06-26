import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, validatePasswordStrength, sanitizeInput } from '@/lib/auth';
import { withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export async function GET(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const user = await db.user.findUnique({
        where: { id },
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
          user_schools: { select: { school_id: true } },
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'Usuário não encontrado' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        user: {
          ...user,
          school_ids: user.user_schools.map((us) => us.school_id),
          user_schools: undefined,
        },
      });
    } catch (error) {
      console.error('Get user error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

export async function PUT(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;
      const body = await _req.json();
      const { full_name, email, password, role, status, profile_photo, school_ids } = body;

      const existingUser = await db.user.findUnique({ where: { id } });
      if (!existingUser) {
        return NextResponse.json(
          { error: 'Usuário não encontrado' },
          { status: 404 }
        );
      }

      // Check email uniqueness if changing
      if (email && email !== existingUser.email) {
        const emailTaken = await db.user.findUnique({ where: { email } });
        if (emailTaken) {
          return NextResponse.json(
            { error: 'Email já cadastrado' },
            { status: 409 }
          );
        }
      }

      // Validate email format if provided
      if (email !== undefined && email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(String(email))) {
          return NextResponse.json(
            { error: 'E-mail inválido' },
            { status: 400 }
          );
        }
      }

      const validRoles = ['Admin', 'Operator', 'Viewer'];
      if (role && !validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Papel inválido' },
          { status: 400 }
        );
      }

      const validStatuses = ['active', 'inactive'];
      if (status !== undefined && status !== null && !validStatuses.includes(status)) {
        return NextResponse.json(
          { error: 'Status inválido. Use: active ou inactive' },
          { status: 400 }
        );
      }

      // Validate profile_photo: must be a base64 image data URL or null
      if (profile_photo !== undefined && profile_photo !== null && profile_photo !== '') {
        const photoStr = String(profile_photo);
        if (!photoStr.startsWith('data:image/')) {
          return NextResponse.json(
            { error: 'Foto de perfil inválida' },
            { status: 400 }
          );
        }
      }

      const updateData: Record<string, unknown> = {};
      // VULN-8 FIX: sanitize free-text fields to prevent stored XSS.
      // `email` is sanitized (it's a string the user controls) — the regex above
      // already restricts its shape but we escape any stray <,>,",'.
      // `role` and `status` are enum-like and validated above — assign as-is.
      // `profile_photo` is a base64 data URL and is validated but NOT sanitized (would break it).
      if (full_name !== undefined) {
        updateData.full_name = full_name ? sanitizeInput(String(full_name)) : null;
      }
      if (email !== undefined) {
        updateData.email = email ? sanitizeInput(String(email)) : null;
      }
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;
      if (profile_photo !== undefined) {
        updateData.profile_photo = profile_photo ? String(profile_photo) : null;
      }
      if (password) {
        // Validate password strength on update too
        const passwordCheck = validatePasswordStrength(password);
        if (!passwordCheck.valid) {
          return NextResponse.json(
            { error: `Senha fraca. Requisitos: ${passwordCheck.errors.join(', ')}` },
            { status: 400 }
          );
        }
        updateData.password = await hashPassword(password);
      }

      // NOTE: Neon HTTP adapter does not support relation selects inside
      // update() (triggers a transaction). Update without user_schools in
      // the select, then fetch the links separately.
      const user = await db.user.update({
        where: { id },
        data: updateData,
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

      // ── Sync school access (only when school_ids is explicitly provided) ──
      if (Array.isArray(school_ids)) {
        const validSchoolIds: string[] = school_ids.filter(
          (sid: unknown): sid is string => typeof sid === 'string' && sid.length > 0
        );

        // Verify all provided school IDs exist
        if (validSchoolIds.length > 0) {
          const existingSchools = await db.school.findMany({
            where: { id: { in: validSchoolIds } },
            select: { id: true },
          });
          if (existingSchools.length !== validSchoolIds.length) {
            return NextResponse.json(
              { error: 'Uma ou mais escolas selecionadas não existem' },
              { status: 400 }
            );
          }
        }

        // Fetch current links
        const currentLinks = await db.userSchool.findMany({
          where: { user_id: id },
          select: { school_id: true },
        });
        const currentSet = new Set(currentLinks.map((l) => l.school_id));
        const newSet = new Set(validSchoolIds);

        const toDelete = [...currentSet].filter((sid) => !newSet.has(sid));
        const toCreate = [...newSet].filter((sid) => !currentSet.has(sid));

        if (toDelete.length > 0) {
          await db.userSchool.deleteMany({
            where: { user_id: id, school_id: { in: toDelete } },
          });
        }
        // Insert each new link individually — Neon HTTP adapter does not
        // support createMany or transactions.
        for (const sid of toCreate) {
          await db.userSchool.create({
            data: { user_id: id, school_id: sid },
          });
        }

        await logAction(
          _req.user!.userId,
          'update_user',
          `Escolas de acesso atualizadas para: ${user.email} (${validSchoolIds.length} escola(s))`,
          _req
        );

        return NextResponse.json({
          user: {
            ...user,
            school_ids: validSchoolIds,
          },
        });
      }

      await logAction(_req.user!.userId, 'update_user', `Usuário atualizado: ${user.email}`, _req);

      // Fetch existing school links to include in the response
      const existingLinks = await db.userSchool.findMany({
        where: { user_id: id },
        select: { school_id: true },
      });

      return NextResponse.json({
        user: {
          ...user,
          school_ids: existingLinks.map((l) => l.school_id),
        },
      });
    } catch (error) {
      console.error('Update user error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}

export async function DELETE(
  req: AuthenticatedRequest,
  context: { params: Promise<{ id: string }> }
) {
  return withRole(['Admin'], async (_req: AuthenticatedRequest) => {
    try {
      const { id } = await context.params;

      // Cannot delete self
      if (_req.user!.userId === id) {
        return NextResponse.json(
          { error: 'Não é possível excluir seu próprio usuário' },
          { status: 400 }
        );
      }

      const existingUser = await db.user.findUnique({ where: { id } });
      if (!existingUser) {
        return NextResponse.json(
          { error: 'Usuário não encontrado' },
          { status: 404 }
        );
      }

      // NOTE: Neon HTTP adapter does not support $transaction, and
      // actionLog.updateMany({ data: { user_id: null } }) internally
      // triggers a transaction. Use raw SQL instead to detach logs.
      await db.attendanceRecord.deleteMany({
        where: { created_by: id },
      });
      // Detach action logs (keep history, null out user_id) via raw SQL
      await db.$executeRaw`UPDATE "action_logs" SET "user_id" = NULL WHERE "user_id" = ${id}`;
      // Delete the user
      await db.user.delete({ where: { id } });

      await logAction(_req.user!.userId, 'delete_user', `Usuário excluído: ${existingUser.email}`, _req);

      return NextResponse.json({ message: 'Usuário excluído com sucesso' });
    } catch (error) {
      console.error('Delete user error:', error);
      return NextResponse.json(
        { error: 'Erro interno do servidor' },
        { status: 500 }
      );
    }
  })(req, context);
}
