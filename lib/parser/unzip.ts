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
  if (file.size > 10 * 1024 * 1024) throw new Error('ZIP files must be smaller than 10 MB.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  if (Object.keys(zip.files).length > 200) throw new Error('Export without media. This ZIP contains too many files.');

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

  for (const entry of sorted.slice(0, 5)) {
    const size=(entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize;
    if (!size || size > 2 * 1024 * 1024) throw new Error('The expanded chat must be smaller than 2 MB. Export a shorter timeframe.');
    const content = await new Promise<string>((resolve,reject)=>{
      let bytes=0;const chunks:Uint8Array[]=[];
      const stream=(entry as unknown as {internalStream(type:'uint8array'):{on(event:'data',fn:(chunk:Uint8Array)=>void):void;on(event:'error',fn:(error:Error)=>void):void;on(event:'end',fn:()=>void):void;pause():void;resume():void}}).internalStream('uint8array');
      stream.on('data',(chunk:Uint8Array)=>{bytes+=chunk.byteLength;if(bytes>2*1024*1024){stream.pause();reject(new Error('Expanded chat exceeds 2 MB.'));}else chunks.push(chunk);});
      stream.on('error',reject);
      stream.on('end',()=>{const result=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}resolve(new TextDecoder().decode(result));});
      stream.resume();
    });
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
