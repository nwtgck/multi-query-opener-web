import { describe, it, expect, vi, beforeEach, } from 'vitest';
import { mount, } from '@vue/test-utils';
import App from './App.vue';

// Mock CompressionStream/DecompressionStream since they are missing in JSDOM
class MockCompressionStream {
  readable = new ReadableStream();
  writable = new WritableStream({
    write(_chunk, _controller) {
      // Pass through for simple testing
    },
  });
}

class MockDecompressionStream {
  readable = new ReadableStream();
  writable = new WritableStream({
    write(_chunk, _controller) {
      // Pass through
    },
  });
}

// Mock window.open
const mockOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockOpen,
  writable: true,
});

// Mock window.location.hash
Object.defineProperty(window, 'location', {
  value: {
    hash: '',
    href: 'http://localhost/',
    replace: vi.fn(),
  },
  writable: true,
});

// Mock history.replaceState
const mockReplaceState = vi.fn();
Object.defineProperty(window.history, 'replaceState', {
  value: mockReplaceState,
  writable: true,
});

globalThis.CompressionStream = MockCompressionStream as any;
globalThis.DecompressionStream = MockDecompressionStream as any;

describe('App.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
    document.title = '';
  });

  it('renders correctly', () => {
    const wrapper = mount(App);
    expect(wrapper.find('[data-testid="app-title"]').text()).toContain('Multi Query Opener');
    expect(wrapper.find('[data-testid="page-title-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="base-url-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="param-key-input"]').exists()).toBe(true);
  });

  it('updates state and document title when inputs change', async () => {
    const wrapper = mount(App);

    const titleInput = wrapper.find('[data-testid="page-title-input"]');
    await titleInput.setValue('My Custom Title');

    expect(document.title).toBe('My Custom Title');
    expect(wrapper.find('[data-testid="app-title"]').text()).toBe('My Custom Title');
  });

  it('shows validation error when required fields are missing', async () => {
    const wrapper = mount(App);
    
    // Ensure fields are empty
    await wrapper.find('[data-testid="base-url-input"]').setValue('');
    await wrapper.find('[data-testid="param-key-input"]').setValue('');

    // Click Open All
    const openAllBtn = wrapper.find('[data-testid="open-all-btn"]');
    await openAllBtn.trigger('click');

    // Check for error message
    expect(wrapper.find('[data-testid="error-alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Please enter both Base URL');
  });

  it('opens URLs when inputs are valid', async () => {
    const wrapper = mount(App);
    
    // Set valid inputs
    await wrapper.find('[data-testid="base-url-input"]').setValue('https://example.com');
    await wrapper.find('[data-testid="param-key-input"]').setValue('q');
    
    const textareas = wrapper.findAll('[data-testid="param-value-input"]');
    await textareas[0]!.setValue('test-query');

    // Mock open to return a window object (success)
    mockOpen.mockReturnValue({} as Window);

    // Click Open All
    const openAllBtn = wrapper.find('[data-testid="open-all-btn"]');
    await openAllBtn.trigger('click');

    expect(mockOpen).toHaveBeenCalled();
    const calledUrl = mockOpen.mock.calls[0]![0];
    expect(calledUrl).toContain('https://example.com');
    expect(calledUrl).toContain('q=test-query');
    expect(mockOpen).toHaveBeenCalledWith(expect.any(String), '_blank', 'noreferrer');
  });

  it('adds and removes parameter values', async () => {
    const wrapper = mount(App);
    
    // Initial state: 1 textarea
    expect(wrapper.findAll('[data-testid="param-value-input"]').length).toBe(1);

    // Add input
    const addBtn = wrapper.find('[data-testid="add-input-btn"]');
    await addBtn.trigger('click');
    expect(wrapper.findAll('[data-testid="param-value-input"]').length).toBe(2);

    // Remove input
    const removeBtns = wrapper.findAll('[data-testid="remove-value-btn"]');
    await removeBtns[0]!.trigger('click');
    expect(wrapper.findAll('[data-testid="param-value-input"]').length).toBe(1);
  });
});
