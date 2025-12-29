<script setup lang="ts">
import { reactive, ref, onMounted, computed, watch, } from 'vue';
import * as CBOR from 'cbor-x';
import { useClipboard, watchDebounced, useColorMode, } from '@vueuse/core';
import Sortable from 'sortablejs';
import { StorageStateDtoSchema, } from './schemas';
import type { 
  ParamItem, 
  ParamValue, 
  ParamGroup, 
  AppState,
} from './types';
import DragHandleIcon from './components/icons/DragHandleIcon.vue';
import RemoveIcon from './components/icons/RemoveIcon.vue';
import OpenIcon from './components/icons/OpenIcon.vue';
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

const saveStateToHash = async () => {
  try {
    const cborData = CBOR.encode(state);
    const compressed = await compressData(cborData);
    const hash = toBase64(compressed);
    window.history.replaceState(null, '', `#${hash}`);
    updateUrlLength();
  } catch (e) {
    console.error('Failed to save state:', e);
  }
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
    const rawDecoded = CBOR.decode(decompressed);
    const parseResult = StorageStateDtoSchema.safeParse(rawDecoded);
    
    if (parseResult.success) {
      const data = parseResult.data;
      // Sync ID counter with loaded data
      syncIdCounter(data.paramValues as ParamItem[]);
      
      state.title = data.title;
      state.baseUrl = data.baseUrl;
      state.paramKey = data.paramKey;
      state.paramValues.splice(0, state.paramValues.length, ...data.paramValues);
    }
  } catch (e) {
    console.error('Failed to load state:', e);
    errorMessage.value = 'Failed to load settings (breaking change applied).';
    state.paramValues = [{ id: nextId(), value: '' }];
  } finally {
    updateUrlLength();
  }
};

watch(() => state.title, (t) => { document.title = t; }, { immediate: true });
watchDebounced(state, () => { saveStateToHash(); }, { debounce: 500, deep: true });

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

const openSingleUrl = (val: string) => {
  if (!state.baseUrl.trim() || !state.paramKey.trim() || !val.trim()) return;
  try {
    const url = new URL(state.baseUrl);
    url.searchParams.append(state.paramKey, val.trim());
    window.open(url.toString(), '_blank', 'noreferrer');
  } catch (e) {
    errorMessage.value = 'Invalid URL configuration.';
  }
};

const openAll = () => {
  const vals: string[] = [];
  state.paramValues.forEach(item => {
    if ('type' in item && item.type === 'group') {
      item.values.forEach(v => { if (v.value.trim()) vals.push(v.value); });
    } else {
      if ((item as ParamValue).value.trim()) vals.push((item as ParamValue).value);
    }
  });
  vals.forEach(openSingleUrl);
};

const { copy, copied } = useClipboard();
const copyShareLink = () => copy(window.location.href);
const colorMode = useColorMode({ initialValue: 'auto' });

const syncSortable = (evt: Sortable.SortableEvent, list: any[]) => {
  const { oldIndex, newIndex, item, from, to } = evt;
  if (from === to) {
    if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
      const [movedItem] = list.splice(oldIndex, 1);
      list.splice(newIndex, 0, movedItem);
    }
  } else if (evt.type === 'add') {
    const id = Number(item.getAttribute('data-id'));
    if (isNaN(id)) return;
    const itemData = findAndRemoveItemData(id);
    if (itemData) list.splice(newIndex!, 0, itemData);
  }
};

const sortableOptions: Sortable.Options = {
  handle: '.drag-handle',
  animation: 150,
  group: 'params',
  ghostClass: 'sortable-ghost',
};

const paramListRef = ref<HTMLElement | null>(null);
onMounted(() => {
  loadStateFromHash();
  if (paramListRef.value) {
    Sortable.create(paramListRef.value, {
      ...sortableOptions,
      onUpdate: (evt) => syncSortable(evt, state.paramValues),
      onAdd: (evt) => syncSortable(evt, state.paramValues),
    });
  }
});

const vSortableGroup = {
  mounted: (el: HTMLElement, binding: any) => {
    Sortable.create(el, {
      ...sortableOptions,
      onMove: (evt) => !evt.dragged.hasAttribute('data-is-group'),
      onUpdate: (evt) => syncSortable(evt, binding.value),
      onAdd: (evt) => syncSortable(evt, binding.value),
    });
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
        <div class="absolute right-0 top-0">
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

      <div v-if="errorMessage" class="mb-6 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 p-4 rounded shadow-sm flex items-start">
        <p class="text-sm text-red-700 dark:text-red-400 font-medium flex-1">{{ errorMessage }}</p>
        <button @click="errorMessage = null" class="ml-auto text-red-500">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <main class="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <section class="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
          <div class="sm:col-span-2">
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Page Title</label>
            <input v-model="state.title" type="text" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Base URL</label>
            <input v-model="state.baseUrl" type="url" placeholder="https://example.com/search" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Query Parameter Name</label>
            <input v-model="state.paramKey" type="text" placeholder="q" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border focus:ring-indigo-500 focus:border-indigo-500" />
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
                <div class="mt-3 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 drag-handle"><DragHandleIcon /></div>
                <div class="flex-1 relative">
                  <textarea v-model="item.value" rows="2" class="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2.5 border pr-10 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Enter value..."></textarea>
                  <button @click="removeValue(item.id)" class="absolute top-2 right-2 text-gray-400 hover:text-red-500" title="Remove"><RemoveIcon /></button>
                </div>
                <button @click="openSingleUrl(item.value)" class="mt-1 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-gray-700 shadow-sm" title="Open in new tab"><OpenIcon /></button>
              </div>

              <div v-else class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50/50 dark:bg-gray-800/50">
                <div class="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700/50">
                  <div class="cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 drag-handle"><DragHandleIcon /></div>
                  <button @click="item.expanded = !item.expanded" class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><ChevronIcon :expanded="item.expanded" /></button>
                  <input v-model="item.name" class="flex-1 bg-transparent border-none text-sm font-semibold text-gray-700 dark:text-gray-200 p-0 focus:ring-0" placeholder="Group Name" />
                  <button @click="removeValue(item.id)" class="text-gray-400 hover:text-red-500" title="Remove Group"><RemoveIcon /></button>
                </div>
                <div v-if="item.expanded" v-sortable-group="item.values" class="p-3 space-y-4 min-h-[40px] bg-white dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
                  <div v-for="vItem in item.values" :key="vItem.id" :data-id="vItem.id" class="flex items-start gap-2">
                    <div class="mt-3 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 drag-handle"><DragHandleIcon /></div>
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
            <pre class="text-[10px] font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">{{ JSON.stringify(state, null, 2) }}</pre>
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
