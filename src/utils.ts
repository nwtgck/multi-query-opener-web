/**
 * Helper to compress data using Gzip (CompressionStream).
 */
export const compressData = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const compressionStream = new CompressionStream('gzip');
  const compressedStream = stream.pipeThrough(compressionStream);
  const reader = compressedStream.getReader();
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
 * Helper to decompress data using Gzip (DecompressionStream).
 */
export const decompressData = async (data: Uint8Array): Promise<Uint8Array> => {
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
