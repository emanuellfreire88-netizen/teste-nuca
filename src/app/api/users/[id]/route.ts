import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
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
          failed_login_attempts: true,
          locked_until: true,
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

      return NextResponse.json({ user });
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
      const { full_name, email, password, role, status, profile_photo } = body;

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

      const validRoles = ['Admin', 'Operator', 'Viewer'];
      if (role && !validRoles.includes(role)) {
        return NextResponse.json(
          { error: 'Papel inválido' },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (full_name !== undefined) updateData.full_name = full_name;
      if (email !== undefined) updateData.email = email;
      if (role !== undefined) updateData.role = role;
      if (status !== undefined) updateData.status = status;
      if (profile_photo !== undefined) updateData.profile_photo = profile_photo;
      if (password) {
        updateData.password = await hashPassword(password);
      }

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
          last_login: true,
          created_at: true,
          updated_at: true,
        },
      });

      await logAction(_req.user!.userId, 'update_user', `Usuário atualizado: ${user.email}`, _req);

      return NextResponse.json({ user });
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
