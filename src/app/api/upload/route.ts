import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { randomUUID } from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';

// Allow up to 6MB request bodies for image uploads
export const maxDuration = 30;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use JPG, PNG ou WebP.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Tamanho máximo: 5MB.' },
        { status: 400 }
      );
    }

    // Ensure the uploads directory exists
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    // Build a unique, safe filename
    const ext = path.extname(file.name || '') || `.${file.type.split('/')[1]}`;
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
    const filename = `${randomUUID()}${safeExt}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Write the file to disk
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    // Public URL path
    const url = `/uploads/${filename}`;

    await logAction(
      req.user!.userId,
      'upload_file',
      `Upload de arquivo: ${filename} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`,
      req
    );

    return NextResponse.json({ url, filename });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor ao fazer upload' },
      { status: 500 }
    );
  }
});
