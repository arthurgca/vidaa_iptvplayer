import type { Program } from '../types.js';

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (_, code: string) => {
    if (code.startsWith('#')) { const hex = code.toLowerCase().startsWith('#x'); return String.fromCharCode(parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10)); }
    return entities[code] || `&${code};`;
  }).replace(/<[^>]+>/g, '').trim();
}

export function parseXmltvDate(raw: string): number {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])(\d{2})(\d{2})?/);
  if (!match) return Date.parse(raw) || 0;
  const [, y, mo, d, h, mi, s = '00', sign, oh, om = '00'] = match;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  const offset = (Number(oh) * 60 + Number(om)) * 60_000;
  return utc - (sign === '+' ? offset : -offset);
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match ? decodeXml(match[1]!) : '';
}

function content(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]!) : '';
}

export interface ParsedXmltv { programs: Program[]; channelNames: Record<string, string[]> }

export function parseXmltv(xml: string, windowStart = Date.now() - 6 * 3600_000, windowEnd = Date.now() + 48 * 3600_000): ParsedXmltv {
  const channelNames: Record<string, string[]> = {};
  const channelRegex = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
  let match: RegExpExecArray | null;
  while ((match = channelRegex.exec(xml))) {
    const id = attr(match[1]!, 'id');
    if (!id) continue;
    const names: string[] = [];
    const nameRegex = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi;
    let name: RegExpExecArray | null;
    while ((name = nameRegex.exec(match[2]!))) names.push(decodeXml(name[1]!));
    channelNames[id] = names.filter(Boolean);
  }
  const programs: Program[] = [];
  const programmeRegex = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  while ((match = programmeRegex.exec(xml))) {
    const start = parseXmltvDate(attr(match[1]!, 'start'));
    const end = parseXmltvDate(attr(match[1]!, 'stop'));
    if (!start || !end || end < windowStart || start > windowEnd) continue;
    const channelId = attr(match[1]!, 'channel');
    const title = content(match[2]!, 'title');
    if (channelId && title) programs.push({ channelId, title, description: content(match[2]!, 'desc') || undefined, start, end });
  }
  programs.sort((a, b) => a.start - b.start);
  return { programs, channelNames };
}
