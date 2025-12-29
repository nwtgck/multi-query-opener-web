import { describe, it, expect, vi, beforeEach, } from 'vitest';
import { mount, } from '@vue/test-utils';
import * as CBOR from 'cbor-x';
import App from './App.vue';

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
        controller.enqueue(chunk);
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

  describe('Grouping functionality', () => {
    it('can add a group and nested values', async () => {
      const wrapper = mount(App);
      const addGroupBtn = wrapper.find('button:contains("Add Group")');
      // If contains doesn't work in this version of test-utils, find by text
      const buttons = wrapper.findAll('button');
      const addGroupButton = buttons.find(b => b.text() === 'Add Group');
      
      await addGroupButton?.trigger('click');
      
      expect(wrapper.html()).toContain('Group Name');
      expect(wrapper.html()).toContain('Add Value to Group');
    });

    it('opens URLs from both root and groups', async () => {
      const wrapper = mount(App);
      await wrapper.find('[data-testid="base-url-input"]').setValue('https://example.com');
      await wrapper.find('[data-testid="param-key-input"]').setValue('q');
      
      // Set root value
      const rootTextareas = wrapper.findAll('[data-testid="param-value-input"]');
      await rootTextareas[0]!.setValue('root-val');
      
      // Add group and value
      const buttons = wrapper.findAll('button');
      const addGroupButton = buttons.find(b => b.text() === 'Add Group');
      await addGroupButton?.trigger('click');
      
      // Find the group's "Add Value to Group" button
      const addValToGroupBtn = wrapper.find('button:contains("+ Add Value to Group")');
      // Again, using text search if needed
      const allButtons = wrapper.findAll('button');
      const addValBtn = allButtons.find(b => b.text() === '+ Add Value to Group');
      await addValBtn?.trigger('click');

      // Now we should have 3 textareas: 1 root, 2 in group (because group starts with 1)
      const allTextareas = wrapper.findAll('textarea');
      // Root is usually first, but let's be safe. In our template root items and group items are mixed.
      // Group values are also rendered as textareas but without data-testid="param-value-input" currently
      // Actually, I should have added data-testid to group values too.
      
      await allTextareas[1]!.setValue('group-val-1');
      await allTextareas[2]!.setValue('group-val-2');

      mockOpen.mockReturnValue({} as Window);
      const openAllBtn = wrapper.find('[data-testid="open-all-btn"]');
      await openAllBtn.trigger('click');

      expect(mockOpen).toHaveBeenCalledTimes(3);
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('q=root-val'), '_blank', 'noreferrer');
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('q=group-val-1'), '_blank', 'noreferrer');
      expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('q=group-val-2'), '_blank', 'noreferrer');
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
      // Create a valid hash manually
      const initialState = {
        title: 'Shared Config',
        baseUrl: 'https://api.test',
        paramKey: 'key',
        paramValues: ['val1', 'val2'],
      };
      
      // Encode using CBOR (MockTransformStream is pass-through, so no gzip happens in test)
      const cborData = CBOR.encode(initialState);
      const binary = Array.from(cborData).map((b) => String.fromCharCode(b)).join('');
      const hash = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      mockLocation.hash = `#${hash}`;

      const wrapper = mount(App);
      
      // Wait for async loadStateFromHash (which uses await decompressData)
      // Since it's called in onMounted, we need to wait
      await vi.runAllTimersAsync();

      expect(wrapper.find('[data-testid="page-title-input"]').element instanceof HTMLInputElement).toBe(true);
      expect((wrapper.find('[data-testid="page-title-input"]').element as HTMLInputElement).value).toBe('Shared Config');
      expect((wrapper.find('[data-testid="base-url-input"]').element as HTMLInputElement).value).toBe('https://api.test');
      
      const textareas = wrapper.findAll('[data-testid="param-value-input"]');
      expect(textareas.length).toBe(2);
      expect((textareas[0]!.element as HTMLTextAreaElement).value).toBe('val1');
    });
  });
});