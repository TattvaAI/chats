import JSZip from 'jszip';
import { parseWhatsAppChat } from './whatsapp';

export function isZipFile(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith('.zip');
}

function isPreferredChatName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('chat') || lower.includes('whatsapp');
}

export async function extractChatTxtFromZip(
  file: File
): Promise<{ fileName: string; content: string }> {
  const zip = await JSZip.loadAsync(file);

  const txtEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.txt')
  );

  if (txtEntries.length === 0) {
    throw new Error(
      'No chat .txt found inside this ZIP. Please upload the WhatsApp .txt export or a ZIP containing it.'
    );
  }

  const sorted = [...txtEntries].sort((a, b) => {
    const aPref = isPreferredChatName(a.name) ? 0 : 1;
    const bPref = isPreferredChatName(b.name) ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    const aSize =
      (a as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0;
    const bSize =
      (b as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0;
    return bSize - aSize;
  });

  for (const entry of sorted) {
    const content = await entry.async('string');
    if (!content || !content.trim()) continue;
    try {
      const parsed = parseWhatsAppChat(content);
      if (parsed.messages.length > 0) {
        const baseName = entry.name.split('/').pop() || entry.name;
        return { fileName: baseName, content };
      }
    } catch {
      continue;
    }
  }

  throw new Error(
    'No chat .txt found inside this ZIP. Please upload the WhatsApp .txt export or a ZIP containing it.'
  );
}
