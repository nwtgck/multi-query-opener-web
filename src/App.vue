<script setup lang="ts">
import { reactive, ref, onMounted, computed, watch, } from 'vue';
import * as CBOR from 'cbor-x';
import { useClipboard, watchDebounced, useColorMode, } from '@vueuse/core';
import { useSortable, } from '@vueuse/integrations/useSortable';
import { StorageStateSchema, } from './schemas';
import DragHandleIcon from './components/icons/DragHandleIcon.vue';
import RemoveIcon from './components/icons/RemoveIcon.vue';
import OpenIcon from './components/icons/OpenIcon.vue';
import ErrorIcon from './components/icons/ErrorIcon.vue';
import CloseIcon from './components/icons/CloseIcon.vue';
import ChevronIcon from './components/icons/ChevronIcon.vue';
import {
  compressData,
  decompressData,
  toBase64,
  fromBase64,
} from './utils';

/**
 * State of the application (mutable version for Vue reactive).
 */
const state = reactive({
  title: 'Multi Query Opener',
  baseUrl: '',
  paramKey: '',
  paramValues: [''] as (string | { type: 'group'; name: string; values: string[]; expanded: boolean })[],
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
 * Compress and save state to URL hash.
 */
const saveStateToHash = async () => {
  try {
    const data: any = {
      title: state.title,
      baseUrl: state.baseUrl,
      paramKey: state.paramKey,
      paramValues: state.paramValues.map((v) => {
        if (typeof v === 'string') return v;
        return {
          ...v,
          values: v.values.filter((sv) => sv.trim() !== ''),
        };
      }).filter((v) => {
        if (typeof v === 'string') return v.trim() !== '';
        return true;
      }),
    };

    const cborData = CBOR.encode(data);
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
  updateUrlLength();
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  errorMessage.value = null;
  errorDetails.value = null;
  isErrorExpanded.value = false;

  try {
    const compressed = fromBase64(hash);
    const decompressed = await decompressData(compressed);
    const rawDecoded = CBOR.decode(decompressed);
    
    const parseResult = StorageStateSchema.safeParse(rawDecoded);
    
    if (parseResult.success) {
      const decoded = parseResult.data;
      state.title = decoded.title || 'Multi Query Opener';
      state.baseUrl = decoded.baseUrl || '';
      state.paramKey = decoded.paramKey || '';
      
      const newValues = decoded.paramValues && decoded.paramValues.length > 0 ? [...decoded.paramValues] : [''];
      // Use splice to maintain the array reference for useSortable
      state.paramValues.splice(0, state.paramValues.length, ...newValues);
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
 * Sync page title with document.title.
 */
watch(() => state.title, (newTitle) => {
  document.title = newTitle;
}, { immediate: true, });

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

const addGroup = () => {
  state.paramValues.push({
    type: 'group',
    name: 'New Group',
    values: [''],
    expanded: true,
  });
};

const removeValue = (index: number) => {
  if (state.paramValues.length > 1) {
    state.paramValues.splice(index, 1);
  } else {
    state.paramValues[0] = '';
  }
};

const addValueToGroup = (groupIndex: number) => {
  const item = state.paramValues[groupIndex];
  if (item && typeof item !== 'string' && item.type === 'group') {
    item.values.push('');
  }
};

const removeValueFromGroup = (groupIndex: number, valueIndex: number) => {
  const item = state.paramValues[groupIndex];
  if (item && typeof item !== 'string' && item.type === 'group') {
    if (item.values.length > 1) {
      item.values.splice(valueIndex, 1);
    } else {
      item.values[0] = '';
    }
  }
};

/**
 * Validate base configuration.
 */
const validateConfig = (): boolean => {
  if (!state.baseUrl.trim() || !state.paramKey.trim()) {
    errorMessage.value = 'Please enter both Base URL and Query Parameter Name.';
    errorDetails.value = null;
    return false;
  }
  return true;
};

/**
 * Core logic to open a URL with a specific parameter.
 * Returns true if opened successfully, false if blocked.
 */
const openSingleUrl = (val: string): boolean => {
  errorMessage.value = null;
  
  if (!validateConfig()) return false;

  if (!val.trim()) {
    errorMessage.value = 'Please enter a value for the query parameter.';
    return false;
  }

  try {
    const url = new URL(state.baseUrl);
    url.searchParams.append(state.paramKey, val.trim());
    // Open in new tab without referrer
    const win = window.open(url.toString(), '_blank', 'noreferrer');
    return win !== null;
  } catch (e) {
    console.error(`Invalid URL: ${state.baseUrl}`, e);
    errorMessage.value = `Invalid Base URL: ${state.baseUrl}`;
    return false;
  }
};

const openAll = () => {
  errorMessage.value = null;

  if (!validateConfig()) return;

  const activeValues: string[] = [];
  for (const item of state.paramValues) {
    if (typeof item === 'string') {
      if (item.trim()) activeValues.push(item);
    } else {
      for (const val of item.values) {
        if (val.trim()) activeValues.push(val);
      }
    }
  }

  if (activeValues.length === 0) {
    errorMessage.value = 'Please enter at least one query parameter value.';
    return;
  }

  let blockedCount = 0;
  let openedCount = 0;

  for (const val of activeValues) {
    const success = openSingleUrl(val);
    if (success) {
      openedCount++;
    } else {
      // If validateConfig failed inside openSingleUrl (unlikely here)
      // or if it was blocked by popup blocker
      if (!errorMessage.value) {
        blockedCount++;
      }
    }
  }

  if (blockedCount > 0) {
    alert(
      `${blockedCount} tabs were blocked by your browser.\n\nPlease allow pop-ups for this site in your browser settings (look for an icon in the address bar) and try again.`, 
    );
  }
};

const { copy, copied, } = useClipboard();
const copyShareLink = () => {
  copy(window.location.href);
};

const colorMode = useColorMode({
  initialValue: 'auto',
});

const paramListRef = ref<HTMLElement | null>(null);

useSortable(paramListRef, state.paramValues, {
  handle: '.drag-handle',
  animation: 150,
});

/**
 * Component to handle nested sortable for groups.
 * Since we're in a single file, we can use a small functional approach
 * or just a custom directive-like effect.
 */
const vSortable = {
  mounted: (el: HTMLElement, binding: any) => {
    useSortable(el, binding.value, {
      handle: '.group-drag-handle',
      animation: 150,
    });
  },
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
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-200">
    <div class="max-w-3xl mx-auto">
      <header class="mb-8 text-center relative">
        <div class="absolute right-0 top-0">
          <select
            v-model="colorMode"
            data-testid="color-mode-select"
            class="text-xs border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
          >
            <option value="auto">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <h1 data-testid="app-title" class="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          <a href="./" class="hover:opacity-80 transition-opacity">
            {{ state.title || 'Multi Query Opener' }}
          </a>
        </h1>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Open multiple URLs at once with different query parameters. State is saved in the URL fragment.
        </p>
      </header>

      <!-- Error Message Section -->
      <div
        v-if="errorMessage"
        data-testid="error-alert"
        class="mb-6 bg-red-50 border-l-4 border-red-400 p-4 rounded shadow-sm"
      >
        <div class="flex items-start justify-between">
          <div class="flex">
            <div class="flex-shrink-0">
              <ErrorIcon class="text-red-400" />
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
            <CloseIcon />
          </button>
        </div>
      </div>

      <main class="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <!-- Configuration Section -->
        <section class="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
          <div class="sm:col-span-2">
            <label for="page-title" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Page Title</label>
            <input
              id="page-title"
              v-model="state.title"
              data-testid="page-title-input"
              type="text"
              placeholder="Enter page title..."
              class="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
          </div>
          <div>
            <label for="base-url" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Base URL</label>
            <input
              id="base-url"
              v-model="state.baseUrl"
              data-testid="base-url-input"
              type="url"
              placeholder="https://example.com/search"
              class="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
          </div>
          <div>
            <label for="param-key" class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Query Parameter Name</label>
            <input
              id="param-key"
              v-model="state.paramKey"
              data-testid="param-key-input"
              type="text"
              placeholder="q"
              class="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            />
          </div>
        </section>

        <!-- Values Section -->
        <section class="mb-8">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Query Parameter Values</h2>
          </div>
          
          <div ref="paramListRef" class="space-y-4">
            <div
              v-for="(item, index) in state.paramValues"
              :key="index"
              class="group/item"
              data-testid="param-item-container"
            >
              <!-- Single Value Item -->
              <div v-if="typeof item === 'string'" class="relative flex items-start gap-2">
                <div class="mt-3 cursor-move text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 drag-handle">
                  <DragHandleIcon />
                </div>
                <div class="flex-1 relative">
                  <textarea
                    v-model="state.paramValues[index] as string"
                    rows="2"
                    data-testid="param-value-input"
                    class="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border pr-10 bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                    placeholder="Enter value..."
                  ></textarea>
                  <button
                    @click="removeValue(index)"
                    data-testid="remove-value-btn"
                    class="absolute top-2 right-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    title="Remove"
                  >
                    <RemoveIcon />
                  </button>
                </div>
                <button
                  @click="openSingleUrl(item)"
                  type="button"
                  title="Open in new tab"
                  data-testid="open-single-btn"
                  class="mt-1 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-600 dark:hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 shadow-sm"
                >
                  <OpenIcon />
                </button>
              </div>

              <!-- Group Item -->
              <div v-else class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50/50 dark:bg-gray-800/50">
                <div class="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700/50">
                  <div class="cursor-move text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 drag-handle">
                    <DragHandleIcon />
                  </div>
                  <button 
                    @click="item.expanded = !item.expanded"
                    class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <ChevronIcon :expanded="item.expanded" />
                  </button>
                  <input 
                    v-model="item.name"
                    type="text"
                    class="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 dark:text-gray-200 p-0"
                    placeholder="Group Name"
                  />
                  <button
                    @click="removeValue(index)"
                    class="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    title="Remove Group"
                  >
                    <RemoveIcon />
                  </button>
                </div>
                
                <div v-if="item.expanded" v-sortable="item.values" class="p-3 space-y-4">
                  <div 
                    v-for="(_, vIndex) in item.values" 
                    :key="vIndex"
                    class="relative flex items-start gap-2 pl-2"
                  >
                    <div class="mt-3 cursor-move text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 group-drag-handle">
                      <DragHandleIcon />
                    </div>
                    <div class="flex-1 relative">
                      <textarea
                        v-model="item.values[vIndex]"
                        rows="2"
                        class="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2.5 border pr-10 bg-white dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                        placeholder="Enter value..."
                      ></textarea>
                      <button
                        @click="removeValueFromGroup(index, vIndex)"
                        class="absolute top-2 right-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                        title="Remove"
                      >
                        <RemoveIcon />
                      </button>
                    </div>
                    <button
                      @click="openSingleUrl(item.values[vIndex] || '')"
                      type="button"
                      class="mt-1 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 shadow-sm"
                    >
                      <OpenIcon />
                    </button>
                  </div>
                  <div class="flex justify-start pl-6">
                    <button
                      @click="addValueToGroup(index)"
                      type="button"
                      class="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      + Add Value to Group
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 flex justify-end gap-3">
            <button
              @click="addGroup"
              type="button"
              class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-full shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
            >
              Add Group
            </button>
            <button
              @click="addValue"
              data-testid="add-input-btn"
              type="button"
              class="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
            >
              Add Input
            </button>
          </div>
        </section>

        <!-- Action Section -->
        <div class="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-100 dark:border-gray-700">
          <button
            @click="openAll"
            type="button"
            data-testid="open-all-btn"
            class="flex-1 inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Open All in New Tabs
          </button>
          <button
            @click="copyShareLink"
            type="button"
            data-testid="copy-link-btn"
            class="inline-flex justify-center items-center px-6 py-3 border border-gray-300 dark:border-gray-600 shadow-sm text-base font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {{ copied ? 'Copied!' : 'Copy Shareable Link' }}
          </button>
        </div>

        <div class="mt-4 flex justify-end">
          <div
            :class="urlLengthClass"
            data-testid="url-length-display"
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
.rotate-180 {
  transform: rotate(180deg);
}
</style>