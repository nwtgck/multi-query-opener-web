import LZString from 'lz-string';

/**
 * Helper to compress data using LZ-String.
 * Since LZ-String works on strings, we convert our binary data to a base64 string first.
 */
export const compressData = async (data: Uint8Array): Promise<Uint8Array> => {
  // Convert binary to base64 string (safe for LZ-String)
  const base64 = toBase64(data);
  const compressed = LZString.compress(base64);
  // Convert compressed string to Uint8Array (binary string approach to handle potentially non-UTF8)
  const result = new Uint8Array(compressed.length * 2);
  for (let i = 0; i < compressed.length; i++) {
    const code = compressed.charCodeAt(i);
    result[i * 2] = code & 0xff;
    result[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return result;
};

/**
 * Helper to decompress data using Gzip (DecompressionStream).
 */
const decompressGzip = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const decompressionStream = new DecompressionStream('gzip');
  const decompressedStream = stream.pipeThrough(decompressionStream);
  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value, } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

/**
 * Helper to decompress data using LZ-String.
 */
const decompressLZString = async (data: Uint8Array): Promise<Uint8Array> => {
  let compressed = '';
  for (let i = 0; i < data.length; i += 2) {
    compressed += String.fromCharCode(data[i]! + (data[i + 1]! << 8));
  }
  const base64 = LZString.decompress(compressed);
  if (!base64) throw new Error('Failed to decompress with LZ-String');
  
  return fromBase64(base64);
};

/**
 * Helper to decompress data, detecting format by magic numbers.
 */
export const decompressData = async (data: Uint8Array): Promise<Uint8Array> => {
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    return decompressGzip(data);
  }
  // Default to LZ-String
  return decompressLZString(data);
};

/**
 * Helper to convert Uint8Array to Base64 string safely for URLs.
 */
export const toBase64 = (arr: Uint8Array): string => {
  const binary = Array.from(arr).map((b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Helper to convert Base64 string back to Uint8Array.
 */
export const fromBase64 = (base64: string): Uint8Array => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};
