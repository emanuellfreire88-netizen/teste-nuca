import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { randomUUID } from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Allow up to 30s for image uploads (large files on slow connections)
export const maxDuration = 30;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  let debugInfo = 'unknown';
  try {
    debugInfo = 'parsing-formdata';
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
    debugInfo = 'mkdir';
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    // Build a unique, safe filename
    const ext = path.extname(file.name || '') || `.${file.type.split('/')[1]}`;
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
    const filename = `${randomUUID()}${safeExt}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Write the file to disk
    debugInfo = 'writefile';
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    // Verify the file was actually written
    debugInfo = 'verify';
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size === 0) {
      throw new Error(`File write verification failed: size=${stat.size}`);
    }

    // Public URL path
    const url = `/uploads/${filename}`;

    debugInfo = 'logaction';
    await logAction(
      req.user!.userId,
      'upload_file',
      `Upload de arquivo: ${filename} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`,
      req
    );

    return NextResponse.json({ url, filename });
  } catch (error) {
    // Log the actual error with context so we can diagnose the real cause
    const errMessage = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    console.error('Upload error:', {
      stage: debugInfo,
      message: errMessage,
      stack: errStack,
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      {
        error: 'Erro interno do servidor ao fazer upload',
        detail: errMessage,
      },
      { status: 500 }
    );
  }
});
