import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/middleware';
import { writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Magic bytes for image validation
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF];
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47];

function isValidImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  // Check JPEG magic bytes
  if (
    buffer[0] === JPEG_MAGIC[0] &&
    buffer[1] === JPEG_MAGIC[1] &&
    buffer[2] === JPEG_MAGIC[2]
  ) {
    return true;
  }

  // Check PNG magic bytes
  if (
    buffer[0] === PNG_MAGIC[0] &&
    buffer[1] === PNG_MAGIC[1] &&
    buffer[2] === PNG_MAGIC[2] &&
    buffer[3] === PNG_MAGIC[3]
  ) {
    return true;
  }

  return false;
}

function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  return 'jpg'; // default for jpeg
}

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Nenhum arquivo enviado' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não permitido. Use JPG ou PNG' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Tamanho máximo: 5MB' },
        { status: 400 }
      );
    }

    // Validate file size minimum (prevent empty file attacks)
    if (file.size < 100) {
      return NextResponse.json(
        { error: 'Arquivo muito pequeno. Pode estar corrompido.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate magic bytes (prevent file type spoofing)
    if (!isValidImageBuffer(buffer)) {
      return NextResponse.json(
        { error: 'Arquivo de imagem inválido ou corrompido' },
        { status: 400 }
      );
    }

    // Generate safe filename using UUID + extension from MIME type (not from user input)
    const ext = getExtensionFromMimeType(file.type);
    const uniqueName = `${randomUUID()}.${ext}`;

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadDir, uniqueName);

    // Ensure the resolved path is within the upload directory (prevent path traversal)
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(uploadDir);
    if (!resolvedPath.startsWith(resolvedDir)) {
      return NextResponse.json(
        { error: 'Caminho de arquivo inválido' },
        { status: 400 }
      );
    }

    await writeFile(resolvedPath, buffer);

    const url = `/uploads/${uniqueName}`;

    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
});
