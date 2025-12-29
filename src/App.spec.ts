import { describe, it, expect, vi, beforeEach, } from 'vitest';
import { mount, } from '@vue/test-utils';
import * as CBOR from 'cbor-x';
import App from './App.vue';

// Mock lz-string
vi.mock('lz-string', () => {
  return {
    default: {
      compress: vi.fn((data) => data),
      decompress: vi.fn((data) => data),
    },
  };
});

/**
 * Enhanced Mock for CompressionStream/DecompressionStream.
 * It simulates a pass-through stream since JSDOM doesn't support them.
 */
class MockTransformStream {
  readable: ReadableStream;
  writable: WritableStream;

  constructor() {
    let controller: ReadableStreamDefaultController;
    this.readable = new ReadableStream({
      start(c) {
        controller = c;
      },
    });
    this.writable = new WritableStream({
      write(chunk) {
        // Simulate decompression: if it looks like our mock legacy gzip (starts with 1f 8b),
        // strip the first two bytes to get back to the CBOR data.
        if (chunk instanceof Uint8Array && chunk.length >= 2 && chunk[0] === 0x1f && chunk[1] === 0x8b) {
          controller.enqueue(chunk.slice(2));
        } else {
          controller.enqueue(chunk);
        }
      },
      close() {
        controller.close();
      },
    });
  }
}

// Mock window.open
const mockOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockOpen,
  writable: true,
});

// Mock window.location
const mockLocation = {
  hash: '',
  href: 'http://localhost/',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Mock history.replaceState
const mockReplaceState = vi.fn((_state, _title, url) => {
  mockLocation.hash = url.startsWith('#') ? url : new URL(url, 'http://localhost').hash;
  mockLocation.href = `http://localhost/${url}`;
});
Object.defineProperty(window.history, 'replaceState', {
  value: mockReplaceState,
  writable: true,
});

globalThis.CompressionStream = MockTransformStream as any;
globalThis.DecompressionStream = MockTransformStream as any;

describe('App.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockLocation.hash = '';
    mockLocation.href = 'http://localhost/';
    document.title = '';
  });

  describe('Initial rendering', () => {
    it('renders correctly', () => {
      const wrapper = mount(App);
      expect(wrapper.find('[data-testid="app-title"]').text()).toContain('Multi Query Opener');
      expect(wrapper.find('[data-testid="page-title-input"]').exists()).toBe(true);
    });
  });

  describe('State updates', () => {
    it('updates state and document title when inputs change', async () => {
      const wrapper = mount(App);
      const titleInput = wrapper.find('[data-testid="page-title-input"]');
      await titleInput.setValue('My Custom Title');
      expect(document.title).toBe('My Custom Title');
    });
  });

  describe('Validation', () => {
    it('shows validation error when required fields are missing', async () => {
      const wrapper = mount(App);
      await wrapper.find('[data-testid="base-url-input"]').setValue('');
      await wrapper.find('[data-testid="param-key-input"]').setValue('');
      const openAllBtn = wrapper.find('[data-testid="open-all-btn"]');
      await openAllBtn.trigger('click');
      expect(wrapper.find('[data-testid="error-alert"]').exists()).toBe(true);
    });
  });

  describe('URL opening', () => {
    it('opens all URLs when inputs are valid', async () => {
      const wrapper = mount(App);
      await wrapper.find('[data-testid="base-url-input"]').setValue('https://example.com');
      await wrapper.find('[data-testid="param-key-input"]').setValue('q');
      const textareas = wrapper.findAll('[data-testid="param-value-input"]');
      await textareas[0]!.setValue('test-query');
      mockOpen.mockReturnValue({} as Window);

      const openAllBtn = wrapper.find('[data-testid="open-all-btn"]');
      await openAllBtn.trigger('click');

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('q=test-query'),
        '_blank',
        'noreferrer',
      );
    });
  });

  describe('URL Fragment persistence', () => {
    it('updates URL hash when state changes (debounced)', async () => {
      const wrapper = mount(App);
      
      await wrapper.find('[data-testid="page-title-input"]').setValue('New Title');
      
      // State updates are debounced by 500ms
      vi.advanceTimersByTime(500);
      
      // Wait for async compression/replaceState
      await vi.runAllTimersAsync();

      expect(mockReplaceState).toHaveBeenCalled();
      expect(mockLocation.hash).toContain('#');
      expect(mockLocation.hash.length).toBeGreaterThan(1);
    });

    it('restores state from URL hash on mount', async () => {
      // Create a valid hash manually following the new logic:
      // 1. CBOR encode
      // 2. Base64 encode (toBase64)
      // 3. LZString compress (mocked as identity)
      // 4. Convert string to Uint8Array (pair of bytes)
      // 5. Base64 encode for URL (toBase64)
      
      const initialState = {
        title: 'Shared Config',
        baseUrl: 'https://api.test',
        paramKey: 'key',
        paramValues: ['val1', 'val2'],
      };
      
      const cborData = CBOR.encode(initialState);
      const b64 = btoa(Array.from(cborData).map(b => String.fromCharCode(b)).join(''))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      // In our mock, LZString.compress(b64) returns b64
      const compressed = b64; 
      
      const uint8 = new Uint8Array(compressed.length * 2);
      for (let i = 0; i < compressed.length; i++) {
        const code = compressed.charCodeAt(i);
        uint8[i * 2] = code & 0xff;
        uint8[i * 2 + 1] = (code >> 8) & 0xff;
      }

      const finalHash = btoa(Array.from(uint8).map(b => String.fromCharCode(b)).join(''))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      mockLocation.hash = `#${finalHash}`;

      const wrapper = mount(App);
      
      await vi.runAllTimersAsync();

      expect((wrapper.find('[data-testid="page-title-input"]').element as HTMLInputElement).value).toBe('Shared Config');
      expect((wrapper.find('[data-testid="base-url-input"]').element as HTMLInputElement).value).toBe('https://api.test');
      
      const textareas = wrapper.findAll('[data-testid="param-value-input"]');
      expect(textareas.length).toBe(2);
      expect((textareas[0]!.element as HTMLTextAreaElement).value).toBe('val1');
    });

    it('restores state from Gzip magic number (backward compatibility)', async () => {
      const initialState = {
        title: 'Legacy Config',
        baseUrl: 'https://legacy.test',
        paramKey: 'k',
        paramValues: ['v1'],
      };
      
      const cborData = CBOR.encode(initialState);
      // Gzip magic number 1f 8b
      const gzipData = new Uint8Array(cborData.length + 2);
      gzipData[0] = 0x1f;
      gzipData[1] = 0x8b;
      gzipData.set(cborData, 2);
      
      const binary = Array.from(gzipData).map((b) => String.fromCharCode(b)).join('');
      const hash = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      mockLocation.hash = `#${hash}`;

      const wrapper = mount(App);
      
      // Wait for async loadStateFromHash
      await vi.runAllTimersAsync();

      expect((wrapper.find('[data-testid="page-title-input"]').element as HTMLInputElement).value).toBe('Legacy Config');
    });
  });
});
