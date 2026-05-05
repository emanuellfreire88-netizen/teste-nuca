import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const schools = await db.school.findMany({
      include: {
        _count: {
          select: { students: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = schools.map(({ _count, ...school }) => ({
      ...school,
      student_count: _count.students,
    }));

    return NextResponse.json({ schools: result });
  } catch (error) {
    console.error('List schools error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});

export const POST = withRole(['Admin', 'Operator'], async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const {
      name,
      address,
      phone,
      email,
      director_name,
      opening_hours,
      school_photo,
      latitude,
      longitude,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Nome da escola é obrigatório' },
        { status: 400 }
      );
    }

    const school = await db.school.create({
      data: {
        name,
        address: address || null,
        phone: phone || null,
        email: email || null,
        director_name: director_name || null,
        opening_hours: opening_hours || null,
        school_photo: school_photo || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      },
    });

    await logAction(req.user!.userId, 'create_school', `Escola criada: ${name}`, req);

    return NextResponse.json({ school }, { status: 201 });
  } catch (error) {
    console.error('Create school error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
