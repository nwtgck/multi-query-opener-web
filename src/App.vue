<script setup lang="ts">
import { reactive, ref, onMounted, computed, } from 'vue';
import { encode, decode, } from 'cbor-x';
import { useClipboard, watchDebounced, } from '@vueuse/core';
import type { AppState, } from './types';
import { StorageStateSchema, } from './schemas';

/**
 * State of the application (mutable version for Vue reactive).
 */
const state = reactive({
  baseUrl: '',
  paramKey: '',
  paramValues: [''] as string[],
});

/**
 * Error message to display in the UI.
 */
const errorMessage = ref<string | null>(null);

/**
 * Detailed error information (e.g., Zod validation errors).
 */
const errorDetails = ref<string | null>(null);

/**
 * Whether the error details are expanded.
 */
const isErrorExpanded = ref(false);

/**
 * Helper to compress data using Gzip (CompressionStream).
 */
const compressData = async (data: Uint8Array): Promise<Uint8Array> => {
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
const decompressData = async (data: Uint8Array): Promise<Uint8Array> => {
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
const toBase64 = (arr: Uint8Array): string => {
  const binary = Array.from(arr).map((b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Helper to convert Base64 string back to Uint8Array.
 */
const fromBase64 = (base64: string): Uint8Array => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Compress and save state to URL hash.
 */
const saveStateToHash = async () => {
  try {
    const data: AppState = {
      baseUrl: state.baseUrl,
      paramKey: state.paramKey,
      paramValues: state.paramValues.filter((v) => v.trim() !== ''),
    };

    const cborData = encode({
      baseUrl: data.baseUrl,
      paramKey: data.paramKey,
      paramValues: data.paramValues,
    });

    const compressed = await compressData(cborData);
    const hash = toBase64(compressed);
    window.history.replaceState(null, '', `#${hash}`);
    updateUrlLength();
  } catch (e) {
    console.error('Failed to save state:', e);
  }
};

/**
 * Load state from URL hash.
 */
const loadStateFromHash = async () => {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  errorMessage.value = null;
  errorDetails.value = null;
  isErrorExpanded.value = false;

  try {
    const compressed = fromBase64(hash);
    const decompressed = await decompressData(compressed);
    const rawDecoded = decode(decompressed);
    
    const parseResult = StorageStateSchema.safeParse(rawDecoded);
    
    if (parseResult.success) {
      const decoded = parseResult.data;
      state.baseUrl = decoded.baseUrl || '';
      state.paramKey = decoded.paramKey || '';
      state.paramValues = decoded.paramValues && decoded.paramValues.length > 0 ? [...decoded.paramValues] : [''];
    } else {
      console.error('Invalid state data:', parseResult.error);
      errorMessage.value = 'Failed to load settings from URL due to validation errors.';
      errorDetails.value = JSON.stringify(parseResult.error.format(), null, 2);
    }
  } catch (e) {
    console.error('Failed to load state:', e);
    errorMessage.value = 'Failed to load settings from URL. The link might be broken or invalid.';
    if (e instanceof Error) {
      errorDetails.value = e.message + '\n' + e.stack;
    } else {
      errorDetails.value = String(e);
    }
  } finally {
    updateUrlLength();
  }
};

/**
 * Watch for changes and update hash (debounced).
 */
watchDebounced(
  state,
  () => {
    saveStateToHash();
  },
  { debounce: 500, deep: true, },
);

/**
 * UI Actions.
 */
const addValue = () => {
  state.paramValues.push('');
};

const removeValue = (index: number) => {
  if (state.paramValues.length > 1) {
    state.paramValues.splice(index, 1);
  } else {
    state.paramValues[0] = '';
  }
};

/**
 * Core logic to open a URL with a specific parameter.
 * Returns true if opened successfully, false if blocked.
 */
const openSingleUrl = (val: string): boolean => {
  const {baseUrl, paramKey, } = state;
  if (!baseUrl || !paramKey || !val.trim()) return false;

  try {
    const url = new URL(baseUrl);
    url.searchParams.append(paramKey, val.trim());
    // Open in new tab without referrer
    const win = window.open(url.toString(), '_blank', 'noreferrer');
    return win !== null;
  } catch (e) {
    console.error(`Invalid URL: ${baseUrl}`, e);
    return false;
  }
};

const openAll = () => {
  const {baseUrl, paramKey, paramValues, } = state;
  if (!baseUrl || !paramKey) {
    alert('Please enter Base URL and Query Parameter Key.');
    return;
  }

  let blockedCount = 0;
  let openedCount = 0;

  paramValues.forEach((val) => {
    if (!val.trim()) return;
    const success = openSingleUrl(val);
    if (success) {
      openedCount++;
    } else {
      blockedCount++;
    }
  });

  if (blockedCount > 0) {
    alert(
      `${blockedCount} tabs were blocked by your browser.\n\nPlease allow pop-ups for this site in your browser settings (look for an icon in the address bar) and try again.`, 
    );
  } else if (openedCount === 0 && paramValues.some(v => v.trim())) {
    // Fallback if browser returns null even for the first one or logic fails oddly
     alert('Failed to open tabs. Please check your browser popup settings.');
  }
};

const { copy, copied, } = useClipboard();
const copyShareLink = () => {
  copy(window.location.href);
};

/**
 * Current URL length for user reference.
 */
const currentUrlLength = ref(0);

/**
 * Update the URL length based on window.location.href.
 */
const updateUrlLength = () => {
  currentUrlLength.value = window.location.href.length;
};

/**
 * Visual color for URL length.
 */
const urlLengthClass = computed(() => {
  const length = currentUrlLength.value;
  if (length > 2000) return 'text-orange-600 bg-orange-50 border-orange-200';
  if (length > 4000) return 'text-red-600 bg-red-50 border-red-200';
  return 'text-gray-500 bg-gray-50 border-gray-200';
});

onMounted(() => {
  loadStateFromHash();
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
    <div class="max-w-3xl mx-auto">
      <header class="mb-8 text-center">
        <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">
          Multi Query Opener
        </h1>
        <p class="mt-2 text-sm text-gray-600">
          Open multiple URLs at once with different query parameters. State is saved in the URL fragment.
        </p>
      </header>

      <!-- Error Message Section -->
      <div
        v-if="errorMessage"
        class="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded shadow-sm"
      >
        <div class="flex items-start justify-between">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-red-700 font-medium">
                {{ errorMessage }}
              </p>
              <div v-if="errorDetails" class="mt-2">
                <button
                  @click="isErrorExpanded = !isErrorExpanded"
                  class="text-xs text-red-600 hover:text-red-800 underline focus:outline-none"
                >
                  {{ isErrorExpanded ? 'Hide Details' : 'Show Details' }}
                </button>
                <pre
                  v-if="isErrorExpanded"
                  class="mt-2 text-xs text-red-800 bg-red-100 p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono border border-red-200"
                >{{ errorDetails }}</pre>
              </div>
            </div>
          </div>
          <button
            @click="errorMessage = null"
            class="ml-auto pl-3 text-red-500 hover:text-red-600"
          >
            <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <main class="bg-white shadow-sm rounded-xl p-6 border border-gray-200">
        <!-- Configuration Section -->
        <section class="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
          <div>
            <label for="base-url" class="block text-sm font-semibold text-gray-700 mb-1">Base URL</label>
            <input
              id="base-url"
              v-model="state.baseUrl"
              type="url"
              placeholder="https://example.com/search"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
            />
          </div>
          <div>
            <label for="param-key" class="block text-sm font-semibold text-gray-700 mb-1">Query Parameter Name</label>
            <input
              id="param-key"
              v-model="state.paramKey"
              type="text"
              placeholder="q"
              class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border"
            />
          </div>
        </section>

        <!-- Values Section -->
        <section class="mb-8">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-semibold text-gray-700">Query Parameter Values</h2>
            <button
              @click="addValue"
              type="button"
              class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Add Input
            </button>
          </div>
          
          <div class="space-y-4">
            <div
              v-for="(_, index) in state.paramValues"
              :key="index"
              class="relative flex items-start gap-2"
            >
              <div class="flex-1 relative">
                <textarea
                  v-model="state.paramValues[index]"
                  rows="2"
                  class="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border pr-10"
                  placeholder="Enter value..."
                ></textarea>
                <button
                  @click="removeValue(index)"
                  class="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                  title="Remove"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
              <button
                @click="openSingleUrl(state.paramValues[index]!)"
                type="button"
                title="Open in new tab"
                class="mt-1 p-2.5 rounded-md border border-gray-300 text-gray-500 hover:text-indigo-600 hover:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        <!-- Action Section -->
        <div class="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-100">
          <button
            @click="openAll"
            type="button"
            class="flex-1 inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Open All in New Tabs
          </button>
          <button
            @click="copyShareLink"
            type="button"
            class="inline-flex justify-center items-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {{ copied ? 'Copied!' : 'Copy Shareable Link' }}
          </button>
        </div>

        <div class="mt-4 flex justify-end">
          <div
            :class="urlLengthClass"
            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
            title="Current URL character length"
          >
            <svg class="mr-1.5 h-2 w-2" :class="urlLengthClass.split(' ')[0]" fill="currentColor" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" />
            </svg>
            URL Length: {{ currentUrlLength }} characters
          </div>
        </div>
      </main>
      
      <footer class="mt-8 text-center text-xs text-gray-500">
        All data is stored in the URL fragment after being encoded with CBOR and compressed with Gzip.
      </footer>
    </div>
  </div>
</template>

<style>
/* Base styles already handled by Tailwind */
</style>