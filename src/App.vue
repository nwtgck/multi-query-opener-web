<script setup lang="ts">
import { reactive, ref, onMounted, computed, watch, nextTick, } from 'vue';
import * as CBOR from 'cbor-x';
import { useClipboard, watchDebounced, useColorMode, useLocalStorage, } from '@vueuse/core';
import Sortable from 'sortablejs';
import { StorageStateDtoSchema, } from './schemas';
import type { 
  ParamItem, 
  ParamValue, 
  ParamGroup, 
  AppState,
  StorageStateDto,
} from './types';
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

// Global counter for sequential IDs
let _idCounter = 0;
const nextId = () => ++_idCounter;

const state = reactive<AppState>({
  title: 'Multi Query Opener',
  baseUrl: '',
  paramKey: '',
  paramValues: [],
});

const errorMessage = ref<string | null>(null);
const isDebugOpen = ref(false);
const isReady = ref(false);
const isDragEnabled = useLocalStorage('mqo-drag-enabled', true);

// Store sortable instances to update their 'disabled' state
const sortableInstances: Sortable[] = [];

/**
 * Check if the state contains any meaningful data that warrants a URL hash.
 */
const hasData = () => {
  if (state.baseUrl.trim() !== '' || state.paramKey.trim() !== '') return true;
  if (state.paramValues.length > 1) return true;
  const first = state.paramValues[0];
  if (!first) return false;
  if ('type' in first) return true;
  if (first.value.trim() !== '') return true;
  return false;
};

/**
 * Scan data to find the highest ID and update counter to avoid collision.
 */
const syncIdCounter = (items: ParamItem[]) => {
  items.forEach(item => {
    if (item.id > _idCounter) _idCounter = item.id;
    if ('type' in item && item.type === 'group') {
      item.values.forEach(v => { if (v.id > _idCounter) _idCounter = v.id; });
    }
  });
};

const findAndRemoveItemData = (id: number): ParamItem | null => {
  const topIdx = state.paramValues.findIndex(v => v.id === id);
  if (topIdx !== -1) return (state.paramValues as ParamItem[]).splice(topIdx, 1)[0] || null;
  
  for (const item of state.paramValues) {
    if ('type' in item && item.type === 'group') {
      const gIdx = item.values.findIndex(v => v.id === id);
      if (gIdx !== -1) return (item.values as ParamValue[]).splice(gIdx, 1)[0] || null;
    }
  }
  return null;
};

/**
 * Convert Runtime State to DTO for storage.
 * - Removes 'type' from groups.
 * - expanded: true is omitted (undefined), expanded: false is kept.
 */
const toDto = () => {
  return {
    title: state.title,
    baseUrl: state.baseUrl,
    paramKey: state.paramKey,
    paramValues: state.paramValues.map(item => {
      if ('type' in item && item.type === 'group') {
        return {
          id: item.id,
          name: item.name,
          values: item.values,
          // Only store if false, otherwise leave undefined to save space
          expanded: item.expanded ? undefined : (false as const),
        };
      }
      return item;
    }),
  };
};

const saveStateToHash = async () => {
  try {
    const dto = toDto();
    const cborData = CBOR.encode(dto);
    const compressed = await compressData(cborData);
    const hash = toBase64(compressed);
    window.history.replaceState(null, '', `#${hash}`);
    updateUrlLength();
  } catch (e) {
    console.error('Failed to save state:', e);
  }
};

/**
 * Convert DTO to Runtime State.
 */
const fromDto = (data: StorageStateDto): AppState => {
  const paramValues = data.paramValues.map((item): ParamItem => {
    if (typeof item === 'string') return { id: nextId(), value: item };
    
    // Check if it's a group (it has 'values' array but no 'type' anymore)
    if ('values' in item) {
      return {
        id: item.id,
        type: 'group',
        name: item.name,
        // expanded: undefined -> true, expanded: false -> false
        expanded: item.expanded !== false,
        values: item.values.map((v): ParamValue => ({ 
          id: v.id, 
          value: v.value 
        })),
      };
    }
    
    // It's a single value
    return { id: item.id, value: item.value };
  });

  return {
    title: data.title,
    baseUrl: data.baseUrl,
    paramKey: data.paramKey,
    paramValues: paramValues.length > 0 ? paramValues : [{ id: nextId(), value: '' }],
  };
};

const loadStateFromHash = async () => {
  updateUrlLength();
  const hash = window.location.hash.slice(1);
  if (!hash) {
    state.paramValues = [{ id: nextId(), value: '' }];
    return;
  }

  try {
    const compressed = fromBase64(hash);
    const decompressed = await decompressData(compressed);
    const rawDecoded: unknown = CBOR.decode(decompressed);
    const parseResult = StorageStateDtoSchema.safeParse(rawDecoded);
    
    if (parseResult.success) {
      const normalized = fromDto(parseResult.data);
      syncIdCounter(normalized.paramValues);
      state.title = normalized.title;
      state.baseUrl = normalized.baseUrl;
      state.paramKey = normalized.paramKey;
      state.paramValues.splice(0, state.paramValues.length, ...normalized.paramValues);
    }
  } catch (e) {
    console.error('Failed to load state:', e);
    errorMessage.value = 'Failed to load settings from URL.';
  } finally {
    updateUrlLength();
  }
};

watch(() => state.title, (t) => { document.title = t; }, { immediate: true });
watchDebounced(
  state, 
  () => { 
    if (!isReady.value) return;
    if (!hasData()) {
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return;
    }
    saveStateToHash(); 
  }, 
  { debounce: 500, deep: true }
);

const addValue = () => { state.paramValues.push({ id: nextId(), value: '' }); };
const addGroup = () => {
  state.paramValues.push({
    id: nextId(),
    type: 'group',
    name: 'New Group',
    values: [{ id: nextId(), value: '' }],
    expanded: true,
  });
};

const removeValue = (id: number) => {
  const idx = state.paramValues.findIndex(v => v.id === id);
  if (idx !== -1) {
    state.paramValues.splice(idx, 1);
    if (state.paramValues.length === 0) addValue();
  }
};

const addValueToGroup = (groupId: number) => {
  const g = state.paramValues.find(v => v.id === groupId) as ParamGroup | undefined;
  if (g) g.values.push({ id: nextId(), value: '' });
};

const removeValueFromGroup = (groupId: number, valueId: number) => {
  const g = state.paramValues.find(v => v.id === groupId) as ParamGroup | undefined;
  if (g) {
    const vIdx = g.values.findIndex(v => v.id === valueId);
    if (vIdx !== -1) {
      g.values.splice(vIdx, 1);
      if (g.values.length === 0) g.values.push({ id: nextId(), value: '' });
    }
  }
};

const validateConfig = (): boolean => {
  if (!state.baseUrl.trim() || !state.paramKey.trim()) {
    errorMessage.value = 'Please enter both Base URL and Query Parameter Name.';
    return false;
  }
  return true;
};

const openSingleUrl = (val: string, suppressError = false): boolean => {
  if (!suppressError) errorMessage.value = null;
  if (!validateConfig()) return false;
  if (!val.trim()) {
    if (!suppressError) errorMessage.value = 'Please enter a value for the query parameter.';
    return false;
  }

  try {
    const url = new URL(state.baseUrl);
    url.searchParams.append(state.paramKey, val.trim());
    const win = window.open(url.toString(), '_blank', 'noreferrer');
    if (win === null) {
      if (!suppressError) errorMessage.value = 'The tab was blocked by your browser. Please allow pop-ups for this site.';
      return false;
    }
    return true;
  } catch (e) {
    if (!suppressError) errorMessage.value = 'Invalid Base URL configuration.';
    return false;
  }
};

const openAll = () => {
  errorMessage.value = null;
  if (!validateConfig()) return;

  const activeValues: string[] = [];
  state.paramValues.forEach(item => {
    if ('type' in item && item.type === 'group') {
      item.values.forEach(v => { if (v.value.trim()) activeValues.push(v.value); });
    } else {
      if ((item as ParamValue).value.trim()) activeValues.push((item as ParamValue).value);
    }
  });

  if (activeValues.length === 0) {
    errorMessage.value = 'Please enter at least one query parameter value.';
    return;
  }

  let blockedCount = 0;
  activeValues.forEach(val => {
    const success = openSingleUrl(val, true);
    if (!success) blockedCount++;
  });

  if (blockedCount > 0) {
    errorMessage.value = `${blockedCount} tabs were blocked by your browser. Please allow pop-ups for this site.`;
  }
};

const { copy, copied } = useClipboard();
const copyShareLink = () => copy(window.location.href);
const colorMode = useColorMode({ initialValue: 'auto' });

/**
 * Core Sorting Logic for Vue Reactivity.
 * Using Generics to handle both ParamItem[] and ParamValue[] safely.
 */
const syncSortable = <T extends ParamItem>(evt: Sortable.SortableEvent, list: T[]) => {
  const { oldIndex, newIndex, item, from, to } = evt;
  
  if (from === to) {
    if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
      const movedItem = list[oldIndex];
      if (movedItem) {
        list.splice(oldIndex, 1);
        list.splice(newIndex, 0, movedItem);
      }
    }
  } else if (evt.type === 'add') {
    const id = Number(item.getAttribute('data-id'));
    if (isNaN(id)) return;
    
    const itemData = findAndRemoveItemData(id);
    if (itemData) {
      // At this point, we know via onMove that we aren't nesting groups,
      // so itemData is compatible with T.
      (list as ParamItem[]).splice(newIndex!, 0, itemData);
    }
  }
};

const sortableOptions: Sortable.Options = {
  handle: '.drag-handle',
  animation: 150,
  group: 'params',
  ghostClass: 'sortable-ghost',
  disabled: !isDragEnabled.value,
};

// Update all instances when toggle changes
watch(isDragEnabled, (enabled) => {
  sortableInstances.forEach(s => s.option('disabled', !enabled));
});

const paramListRef = ref<HTMLElement | null>(null);
onMounted(async () => {
  await loadStateFromHash();
  if (paramListRef.value) {
    const s = Sortable.create(paramListRef.value, {
      ...sortableOptions,
      onUpdate: (evt) => syncSortable(evt, state.paramValues),
      onAdd: (evt) => syncSortable(evt, state.paramValues),
    });
    sortableInstances.push(s);
  }
  nextTick(() => { isReady.value = true; });
});

const vSortableGroup = {
  mounted: (el: HTMLElement, binding: { value: ParamValue[] }) => {
    const s = Sortable.create(el, {
      ...sortableOptions,
      onMove: (evt) => !evt.dragged.hasAttribute('data-is-group'),
      onUpdate: (evt) => syncSortable(evt, binding.value),
      onAdd: (evt) => syncSortable(evt, binding.value),
    });
    sortableInstances.push(s);
  },
};

const currentUrlLength = ref(0);
const updateUrlLength = () => { currentUrlLength.value = window.location.href.length; };
const urlLengthClass = computed(() => {
  const l = currentUrlLength.value;
  return l > 4000 ? 'text-red-600 bg-red-50' : l > 2000 ? 'text-orange-600 bg-orange-50' : 'text-gray-500 bg-gray-50';
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4 sm:px-6 lg:px-8 font-sans transition-colors duration-200">
    <div class="max-w-3xl mx-auto">
      <header class="mb-8 text-center relative">
        <div class="absolute right-0 top-0 flex items-center gap-2">
          <label class="flex items-center cursor-pointer gap-2 mr-2">
            <span class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">Drag Reorder</span>
            <div class="relative">
              <input type="checkbox" v-model="isDragEnabled" class="sr-only peer">
              <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
            </div>
          </label>
          <select v-model="colorMode" class="text-xs border-gray-300 rounded-md bg-white dark:bg-gray-800 dark:text-gray-300 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="auto">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          <a href="./" class="hover:opacity-80 transition-opacity">
            {{ state.title || 'Multi Query Opener' }}
          </a>
        </h1>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Organize query values into groups and drag to reorder.</p>
      </header>

      <!-- Error Message Section -->
      <div
        v-if="errorMessage"
        class="mb-6 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 p-4 rounded shadow-sm flex items-start justify-between"
      >
        <div class="flex">
          <div class="flex-shrink-0">
            <ErrorIcon class="text-red-400 w-5 h-5" />
          </div>
          <div class="ml-3">
            <p class="text-sm text-red-700 dark:text-red-400 font-medium">
              {{ errorMessage }}
            </p>
          </div>
        </div>
        <button
          @click="errorMessage = null"
          class="ml-auto pl-3 text-red-500 hover:text-red-600 focus:outline-none"
        >
          <CloseIcon class="w-5 h-5" />
        </button>
      </div>

      <main class="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <section class="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
          <div class="sm:col-span-2">
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Page Title</label>
            <input v-model="state.title" data-testid="page-title-input" type="text" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Base URL</label>
            <input v-model="state.baseUrl" data-testid="base-url-input" type="url" placeholder="https://example.com/search" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Query Parameter Name</label>
            <input v-model="state.paramKey" data-testid="param-key-input" type="text" placeholder="q" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
        </section>

        <section class="mb-8">
          <div ref="paramListRef" class="space-y-4 min-h-[50px]">
            <div
              v-for="item in state.paramValues"
              :key="item.id"
              :data-id="item.id"
              :data-is-group="('type' in item && item.type === 'group') ? 'true' : undefined"
              class="group/item"
            >
              <div v-if="!('type' in item)" class="flex items-start gap-2">
                <div 
                  v-show="isDragEnabled" 
                  class="mt-3 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 drag-handle"
                >
                  <DragHandleIcon />
                </div>
                <div class="flex-1 relative">
                  <textarea v-model="item.value" rows="2" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border pr-10 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Enter value..."></textarea>
                  <button @click="removeValue(item.id)" class="absolute top-2 right-2 text-gray-400 hover:text-red-500" title="Remove"><RemoveIcon /></button>
                </div>
                <button @click="openSingleUrl(item.value)" class="mt-1 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-gray-700 shadow-sm" title="Open in new tab"><OpenIcon /></button>
              </div>

              <div v-else class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50/50 dark:bg-gray-800/50">
                <div class="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700/50">
                  <div 
                    v-show="isDragEnabled" 
                    class="cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 drag-handle"
                  >
                    <DragHandleIcon />
                  </div>
                  <button @click="item.expanded = !item.expanded" class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><ChevronIcon :expanded="item.expanded" /></button>
                  <input 
                    v-model="item.name" 
                    class="flex-1 bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 p-0 focus:ring-0" 
                    placeholder="Group Name" 
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                  <button @click="removeValue(item.id)" class="text-gray-400 hover:text-red-500" title="Remove Group"><RemoveIcon /></button>
                </div>
                <div v-if="item.expanded" v-sortable-group="item.values" class="p-3 space-y-4 min-h-[40px] bg-white dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
                  <div v-for="vItem in item.values" :key="vItem.id" :data-id="vItem.id" class="flex items-start gap-2">
                    <div 
                      v-show="isDragEnabled" 
                      class="mt-3 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 drag-handle"
                    >
                      <DragHandleIcon />
                    </div>
                    <div class="flex-1 relative">
                      <textarea v-model="vItem.value" rows="2" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border pr-10 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Enter value..."></textarea>
                      <button @click="removeValueFromGroup(item.id, vItem.id)" class="absolute top-2 right-2 text-gray-400 hover:text-red-500" title="Remove"><RemoveIcon /></button>
                    </div>
                    <button @click="openSingleUrl(vItem.value)" class="mt-1 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-gray-700 shadow-sm" title="Open in new tab"><OpenIcon /></button>
                  </div>
                  <button @click="addValueToGroup(item.id)" class="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">+ Add Value to Group</button>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 flex justify-end gap-3">
            <button @click="addGroup" class="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-full text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200">Add Group</button>
            <button @click="addValue" class="px-5 py-2.5 text-sm font-medium rounded-full text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200">Add Input</button>
          </div>
        </section>

        <div class="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-100 dark:border-gray-700">
          <button @click="openAll" class="flex-1 px-6 py-3 text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Open All in New Tabs</button>
          <button @click="copyShareLink" class="px-6 py-3 border border-gray-300 dark:border-gray-600 text-base font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">{{ copied ? 'Copied!' : 'Copy Shareable Link' }}</button>
        </div>

        <div class="mt-4 flex justify-end">
          <div :class="urlLengthClass" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border" title="Current URL character length">
            URL Length: {{ currentUrlLength }} characters
          </div>
        </div>
      </main>

      <footer class="mt-8 text-center text-xs text-gray-500">
        <p>All data is stored in the URL fragment after being encoded with CBOR and compressed with Gzip.</p>
        <details 
          class="mt-4 text-left opacity-30 hover:opacity-100 transition-opacity duration-300"
          @toggle="isDebugOpen = ($event.target as HTMLDetailsElement).open"
        >
          <summary class="cursor-pointer text-center list-none hover:text-indigo-500 transition-colors focus:outline-none">Debug State (JSON)</summary>
          <div v-if="isDebugOpen" class="mt-2 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-inner overflow-auto max-h-60">
            <pre class="text-[10px] font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">{{ JSON.stringify(toDto(), null, 2) }}</pre>
          </div>
        </details>
      </footer>
    </div>
  </div>
</template>

<style>
.rotate-180 { transform: rotate(180deg); }
.sortable-ghost { opacity: 0.2; background: #e0e7ff !important; border: 2px dashed #6366f1 !important; }
</style>
