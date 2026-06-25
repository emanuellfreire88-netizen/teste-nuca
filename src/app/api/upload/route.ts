import { NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { logAction } from '@/lib/logger';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Allow up to 30s for image uploads (large files on slow connections)
export const maxDuration = 30;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
// Allow up to 4MB of raw image data on the wire. The resulting base64 data URL
// will be ~33% larger, but Postgres TOAST handles large text values cleanly.
const MAX_SIZE = 4 * 1024 * 1024; // 4MB
// Safety ceiling for the stored data URL — protects the database from abuse.
const MAX_DATA_URL_LENGTH = 6 * 1024 * 1024; // ~6MB base64 ceiling

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
        { error: 'Arquivo muito grande. Tamanho máximo: 4MB.' },
        { status: 400 }
      );
    }

    // ── Vercel-safe storage ───────────────────────────────────────────────
    // Vercel serverless functions run on a READ-ONLY filesystem, so we cannot
    // write uploaded files to /public/uploads. Instead we inline the image as
    // a base64 data URL and return it. The caller stores this string in the
    // database (e.g. users.profile_photo). Postgres TOAST transparently
    // handles large text values, and <img src="data:..."> renders correctly
    // in every browser. This works identically in dev and on Vercel.
    debugInfo = 'read-buffer';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        { error: 'Arquivo vazio' },
        { status: 400 }
      );
    }

    debugInfo = 'encode-dataurl';
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      return NextResponse.json(
        {
          error:
            'Imagem muito grande para armazenar. Use uma imagem menor (idealmente abaixo de 1MB).',
        },
        { status: 413 }
      );
    }

    // A stable, human-readable filename for logging / reference only.
    const ext = (file.type.split('/')[1] || 'bin').toLowerCase();
    const filename = `${randomUUID()}.${ext}`;

    debugInfo = 'logaction';
    await logAction(
      req.user!.userId,
      'upload_file',
      `Upload de arquivo (data URL): ${filename} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`,
      req
    );

    return NextResponse.json({ url: dataUrl, filename });
  } catch (error) {
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
        stage: debugInfo,
      },
      { status: 500 }
    );
  }
});
