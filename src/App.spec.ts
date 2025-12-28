import { describe, it, expect, vi, beforeEach, } from 'vitest';
import { mount, } from '@vue/test-utils';
import App from './App.vue';

// Mock CompressionStream/DecompressionStream since they are missing in JSDOM
class MockCompressionStream {
  readable = new ReadableStream();
  writable = new WritableStream({
    write(chunk, controller) {
      // Pass through for simple testing
    },
  });
}

class MockDecompressionStream {
  readable = new ReadableStream();
  writable = new WritableStream({
    write(chunk, controller) {
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

global.CompressionStream = MockCompressionStream as any;
global.DecompressionStream = MockDecompressionStream as any;

describe('App.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
    document.title = '';
  });

  it('renders correctly', () => {
    const wrapper = mount(App);
    expect(wrapper.find('h1').text()).toContain('Multi Query Opener');
    expect(wrapper.find('#page-title').exists()).toBe(true);
    expect(wrapper.find('#base-url').exists()).toBe(true);
    expect(wrapper.find('#param-key').exists()).toBe(true);
  });

  it('updates state and document title when inputs change', async () => {
    const wrapper = mount(App);

    const titleInput = wrapper.find('#page-title');
    await titleInput.setValue('My Custom Title');

    expect(document.title).toBe('My Custom Title');
    expect(wrapper.find('h1').text()).toBe('My Custom Title');
  });

  it('shows validation error when required fields are missing', async () => {
    const wrapper = mount(App);
    
    // Ensure fields are empty
    await wrapper.find('#base-url').setValue('');
    await wrapper.find('#param-key').setValue('');

    // Click Open All
    const openAllBtn = wrapper.findAll('button').find(b => b.text().includes('Open All'));
    await openAllBtn?.trigger('click');

    // Check for error message
    expect(wrapper.find('.text-red-700').exists()).toBe(true);
    expect(wrapper.text()).toContain('Please enter both Base URL');
  });

  it('opens URLs when inputs are valid', async () => {
    const wrapper = mount(App);
    
    // Set valid inputs
    await wrapper.find('#base-url').setValue('https://example.com');
    await wrapper.find('#param-key').setValue('q');
    
    const textareas = wrapper.findAll('textarea');
    await textareas[0].setValue('test-query');

    // Mock open to return a window object (success)
    mockOpen.mockReturnValue({} as Window);

    // Click Open All
    const openAllBtn = wrapper.findAll('button').find(b => b.text().includes('Open All'));
    await openAllBtn?.trigger('click');

    expect(mockOpen).toHaveBeenCalled();
    const calledUrl = mockOpen.mock.calls[0][0];
    expect(calledUrl).toContain('https://example.com');
    expect(calledUrl).toContain('q=test-query');
    expect(mockOpen).toHaveBeenCalledWith(expect.any(String), '_blank', 'noreferrer');
  });

  it('adds and removes parameter values', async () => {
    const wrapper = mount(App);
    
    // Initial state: 1 textarea
    expect(wrapper.findAll('textarea').length).toBe(1);

    // Add input
    const addBtn = wrapper.findAll('button').find(b => b.text().includes('Add Input'));
    await addBtn?.trigger('click');
    expect(wrapper.findAll('textarea').length).toBe(2);

    // Remove input (click remove button of the first item)
    // The remove button is the one with title="Remove"
    const removeBtns = wrapper.findAll('button[title="Remove"]');
    await removeBtns[0].trigger('click');
    expect(wrapper.findAll('textarea').length).toBe(1);
  });
});
