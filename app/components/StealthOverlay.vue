<script setup lang="ts">
import { ref, computed } from 'vue'
import type { StealthCoverMode } from '~/composables/useStealthMode'

interface Props {
  active: boolean
  mode: StealthCoverMode
  customImageUrl: string | null
  imageFit?: 'cover' | 'contain'
  shortcutLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  imageFit: 'cover',
  shortcutLabel: 'Ctrl+H',
})

const emit = defineEmits<{
  (e: 'exit'): void
}>()

const effectiveMode = computed<StealthCoverMode>(() => {
  if (props.mode === 'image' && !props.customImageUrl) {
    return 'code'
  }
  return props.mode
})

let clickCount = 0
let clickTimer: ReturnType<typeof setTimeout> | null = null

function handleSecretUnlock() {
  clickCount++
  if (clickCount >= 3) {
    clickCount = 0
    if (clickTimer) clearTimeout(clickTimer)
    emit('exit')
    return
  }
  if (clickTimer) clearTimeout(clickTimer)
  clickTimer = setTimeout(() => {
    clickCount = 0
  }, 1000)
}
</script>

<template>
  <div
    v-if="active"
    data-test="stealth-overlay"
    class="fixed inset-0 z-[9999] bg-[#1e1e1e] text-slate-200 select-none overflow-hidden font-sans"
  >
    <!-- Custom Image Cover -->
    <div
      v-if="effectiveMode === 'image' && customImageUrl"
      class="w-full h-full flex items-center justify-center bg-black"
    >
      <img
        data-test="stealth-custom-image"
        :src="customImageUrl"
        alt="Cover"
        class="w-full h-full"
        :class="imageFit === 'contain' ? 'object-contain bg-black' : 'object-cover'"
      />
    </div>

    <!-- Decoy: Spreadsheet -->
    <div
      v-else-if="effectiveMode === 'sheet'"
      data-test="stealth-decoy-sheet"
      class="w-full h-full flex flex-col bg-[#f9fbfd] text-[#1f1f1f] text-xs font-sans select-none"
    >
      <!-- Sheet Top Bar -->
      <div class="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 bg-emerald-600 rounded flex items-center justify-center text-white font-bold text-sm">
            田
          </div>
          <div>
            <div class="font-medium text-sm text-gray-800">Q4_Financial_Model_v3.xlsx</div>
            <div class="flex gap-4 text-xs text-gray-500 mt-0.5">
              <span class="hover:underline cursor-pointer">File</span>
              <span class="hover:underline cursor-pointer">Edit</span>
              <span class="hover:underline cursor-pointer">View</span>
              <span class="hover:underline cursor-pointer">Insert</span>
              <span class="hover:underline cursor-pointer">Format</span>
              <span class="hover:underline cursor-pointer">Data</span>
              <span class="hover:underline cursor-pointer">Tools</span>
            </div>
          </div>
        </div>
        <div class="text-xs text-gray-400">All changes saved to Drive</div>
      </div>

      <!-- Formula Bar -->
      <div class="bg-white border-b border-gray-200 px-4 py-1.5 flex items-center gap-3 text-xs">
        <span class="font-bold text-gray-500 font-mono">B14</span>
        <span class="text-gray-400 font-serif italic">fx</span>
        <div class="flex-1 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 font-mono text-gray-700">
          =SUM(B2:B13) * (1 - C15)
        </div>
      </div>

      <!-- Table View -->
      <div class="flex-1 overflow-auto bg-white">
        <table class="w-full border-collapse text-left font-mono text-[11px]">
          <thead>
            <tr class="bg-gray-100 text-gray-600 border-b border-gray-300">
              <th class="w-10 text-center border-r border-gray-300 py-1 bg-gray-200">#</th>
              <th class="w-48 px-3 border-r border-gray-300 py-1">A (Line Item)</th>
              <th class="w-32 px-3 border-r border-gray-300 py-1 text-right">B (Oct 2026)</th>
              <th class="w-32 px-3 border-r border-gray-300 py-1 text-right">C (Nov 2026)</th>
              <th class="w-32 px-3 border-r border-gray-300 py-1 text-right">D (Dec 2026)</th>
              <th class="w-36 px-3 border-r border-gray-300 py-1 text-right">E (Q4 Total)</th>
              <th class="px-3 py-1">F (Variance)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 text-gray-800">
            <tr>
              <td class="text-center bg-gray-100 border-r border-gray-300 py-1 text-gray-500">1</td>
              <td class="px-3 py-1 font-semibold">Gross Revenue</td>
              <td class="px-3 py-1 text-right">$482,900</td>
              <td class="px-3 py-1 text-right">$512,400</td>
              <td class="px-3 py-1 text-right">$540,100</td>
              <td class="px-3 py-1 text-right font-semibold">$1,535,400</td>
              <td class="px-3 py-1 text-emerald-600">+12.4%</td>
            </tr>
            <tr>
              <td class="text-center bg-gray-100 border-r border-gray-300 py-1 text-gray-500">2</td>
              <td class="px-3 py-1">Cost of Goods Sold (COGS)</td>
              <td class="px-3 py-1 text-right">($115,800)</td>
              <td class="px-3 py-1 text-right">($122,900)</td>
              <td class="px-3 py-1 text-right">($129,600)</td>
              <td class="px-3 py-1 text-right">($368,300)</td>
              <td class="px-3 py-1 text-gray-500">-1.2%</td>
            </tr>
            <tr class="bg-gray-50/50">
              <td class="text-center bg-gray-100 border-r border-gray-300 py-1 text-gray-500">3</td>
              <td class="px-3 py-1 font-medium">Gross Margin</td>
              <td class="px-3 py-1 text-right">$367,100</td>
              <td class="px-3 py-1 text-right">$389,500</td>
              <td class="px-3 py-1 text-right">$410,500</td>
              <td class="px-3 py-1 text-right font-medium">$1,167,100</td>
              <td class="px-3 py-1 text-emerald-600">+14.1%</td>
            </tr>
            <tr>
              <td class="text-center bg-gray-100 border-r border-gray-300 py-1 text-gray-500">4</td>
              <td class="px-3 py-1">Research & Development</td>
              <td class="px-3 py-1 text-right">($94,200)</td>
              <td class="px-3 py-1 text-right">($96,000)</td>
              <td class="px-3 py-1 text-right">($97,500)</td>
              <td class="px-3 py-1 text-right">($287,700)</td>
              <td class="px-3 py-1 text-gray-500">+0.8%</td>
            </tr>
            <tr>
              <td class="text-center bg-gray-100 border-r border-gray-300 py-1 text-gray-500">5</td>
              <td class="px-3 py-1">Sales & Marketing</td>
              <td class="px-3 py-1 text-right">($68,400)</td>
              <td class="px-3 py-1 text-right">($71,200)</td>
              <td class="px-3 py-1 text-right">($73,000)</td>
              <td class="px-3 py-1 text-right">($212,600)</td>
              <td class="px-3 py-1 text-emerald-600">-3.4%</td>
            </tr>
            <tr class="bg-emerald-50/40">
              <td class="text-center bg-gray-100 border-r border-gray-300 py-1 text-gray-500">6</td>
              <td class="px-3 py-1 font-bold">Operating Income (EBIT)</td>
              <td class="px-3 py-1 text-right font-bold">$204,500</td>
              <td class="px-3 py-1 text-right font-bold">$222,300</td>
              <td class="px-3 py-1 text-right font-bold">$240,000</td>
              <td class="px-3 py-1 text-right font-bold">$666,800</td>
              <td class="px-3 py-1 font-bold text-emerald-600">+18.2%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Footer Sheets Bar -->
      <div class="bg-gray-100 border-t border-gray-200 px-4 py-1 flex items-center justify-between text-xs text-gray-600">
        <div class="flex gap-2">
          <span class="bg-white px-3 py-0.5 rounded-t border-t-2 border-emerald-600 font-medium">Summary P&L</span>
          <span class="px-3 py-0.5 hover:bg-gray-200 rounded cursor-pointer">Capex</span>
          <span class="px-3 py-0.5 hover:bg-gray-200 rounded cursor-pointer">Headcount</span>
        </div>
        <div
          data-test="stealth-corner-unlock"
          class="cursor-default select-none text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          @click.stop="handleSecretUnlock"
        >
          Ready | 100%
        </div>
      </div>
    </div>

    <!-- Decoy: Code Editor (Default) -->
    <div
      v-else
      data-test="stealth-decoy-code"
      class="w-full h-full flex flex-col bg-[#181818] text-[#cccccc] font-mono text-xs select-none"
    >
      <!-- Title Bar -->
      <div class="bg-[#1f1f1f] px-3 py-1.5 border-b border-[#2d2d2d] flex items-center justify-between text-[#858585] text-xs">
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-[#ed6a5e] inline-block" />
          <span class="w-3 h-3 rounded-full bg-[#f4bf4f] inline-block" />
          <span class="w-3 h-3 rounded-full bg-[#61c554] inline-block" />
          <span class="ml-4 font-sans text-xs text-[#9d9d9d]">service-orchestrator — Visual Studio Code</span>
        </div>
        <div class="text-[11px] text-[#666666]">Press {{ shortcutLabel }} to toggle</div>
      </div>

      <!-- Main Layout -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Activity Bar -->
        <div class="w-12 bg-[#181818] border-r border-[#2d2d2d] flex flex-col items-center py-3 gap-5 text-[#858585]">
          <span class="text-white cursor-pointer">📁</span>
          <span class="hover:text-white cursor-pointer">🔍</span>
          <span class="hover:text-white cursor-pointer">🔀</span>
          <span class="hover:text-white cursor-pointer">⚙️</span>
        </div>

        <!-- File Tree Sidebar -->
        <div class="w-56 bg-[#1f1f1f] border-r border-[#2d2d2d] p-3 text-xs flex flex-col">
          <div class="text-[11px] font-bold uppercase tracking-wider text-[#6e7681] mb-2">Explorer</div>
          <div class="space-y-1 text-[#cccccc]">
            <div class="text-[#388bfd]">▼ src/core</div>
            <div class="pl-4 text-emerald-400">📄 engine.ts</div>
            <div class="pl-4 text-[#858585]">📄 memory.ts</div>
            <div class="pl-4 text-[#858585]">📄 pipeline.ts</div>
            <div class="text-[#858585]">▶ src/network</div>
            <div class="text-[#858585]">▶ tests</div>
            <div class="text-[#858585]">📄 tsconfig.json</div>
            <div class="text-[#858585]">📄 package.json</div>
          </div>
        </div>

        <!-- Editor Content -->
        <div class="flex-1 flex flex-col bg-[#1e1e1e]">
          <!-- Tab Bar -->
          <div class="bg-[#181818] flex items-center border-b border-[#2d2d2d]">
            <div class="bg-[#1e1e1e] px-4 py-2 border-t-2 border-[#007acc] text-white flex items-center gap-2">
              <span>engine.ts</span>
              <span class="text-[#858585] text-[10px]">✕</span>
            </div>
            <div class="px-4 py-2 text-[#858585] hover:bg-[#1f1f1f] cursor-pointer">
              memory.ts
            </div>
          </div>

          <!-- Code View -->
          <div class="flex-1 p-4 overflow-auto flex leading-relaxed font-mono text-[13px]">
            <div class="text-[#5c6370] select-none pr-4 text-right border-r border-[#2d2d2d] mr-4 space-y-0.5">
              <div v-for="n in 25" :key="n">{{ n }}</div>
            </div>
            <div class="flex-1 space-y-0.5 text-[#abb2bf]">
              <div><span class="text-[#c678dd]">import</span> { <span class="text-[#e5c07b]">BufferQueue</span>, <span class="text-[#e5c07b]">StreamWorker</span> } <span class="text-[#c678dd]">from</span> <span class="text-[#98c379]">'@internal/stream'</span></div>
              <div><span class="text-[#c678dd]">import</span> <span class="text-[#c678dd]">type</span> { <span class="text-[#e5c07b]">TaskPayload</span>, <span class="text-[#e5c07b]">MetricRecord</span> } <span class="text-[#c678dd]">from</span> <span class="text-[#98c379]">'./types'</span></div>
              <div class="h-4" />
              <div><span class="text-[#c678dd]">export class</span> <span class="text-[#e5c07b]">EngineOrchestrator</span> {</div>
              <div class="pl-4"><span class="text-[#e06c75]">private readonly</span> <span class="text-[#e06c75]">queue</span>: <span class="text-[#e5c07b]">BufferQueue</span>&lt;<span class="text-[#e5c07b]">TaskPayload</span>&gt;</div>
              <div class="pl-4"><span class="text-[#e06c75]">private</span> <span class="text-[#e06c75]">isRunning</span> = <span class="text-[#d19a66]">false</span></div>
              <div class="h-4" />
              <div class="pl-4"><span class="text-[#c678dd]">constructor</span>(<span class="text-[#e06c75]">private readonly</span> <span class="text-[#e06c75]">workerPoolSize</span> = <span class="text-[#d19a66]">8</span>) {</div>
              <div class="pl-8"><span class="text-[#e06c75]">this</span>.<span class="text-[#e06c75]">queue</span> = <span class="text-[#c678dd]">new</span> <span class="text-[#e5c07b]">BufferQueue</span>(workerPoolSize * <span class="text-[#d19a66]">4</span>)</div>
              <div class="pl-4">}</div>
              <div class="h-4" />
              <div class="pl-4"><span class="text-[#e06c75]">public async</span> <span class="text-[#61afef]">dispatch</span>(<span class="text-[#e06c75]">task</span>: <span class="text-[#e5c07b]">TaskPayload</span>): <span class="text-[#e5c07b]">Promise</span>&lt;<span class="text-[#e5c07b]">MetricRecord</span>&gt; {</div>
              <div class="pl-8"><span class="text-[#c678dd]">const</span> <span class="text-[#e06c75]">startMark</span> = <span class="text-[#e5c07b]">performance</span>.<span class="text-[#61afef]">now</span>()</div>
              <div class="pl-8"><span class="text-[#c678dd]">await</span> <span class="text-[#e06c75]">this</span>.<span class="text-[#e06c75]">queue</span>.<span class="text-[#61afef]">enqueue</span>(task)</div>
              <div class="pl-8"><span class="text-[#c678dd]">return</span> { <span class="text-[#e06c75]">durationMs</span>: <span class="text-[#e5c07b]">performance</span>.<span class="text-[#61afef]">now</span>() - startMark, <span class="text-[#e06c75]">status</span>: <span class="text-[#98c379]">'processed'</span> }</div>
              <div class="pl-4">}</div>
              <div>}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="bg-[#007acc] text-white px-3 py-0.5 flex items-center justify-between text-[11px]">
        <div class="flex items-center gap-3">
          <span>main*</span>
          <span>0 errors, 0 warnings</span>
        </div>
        <div
          data-test="stealth-corner-unlock"
          class="cursor-default select-none opacity-80 hover:opacity-100 transition-opacity"
          @click.stop="handleSecretUnlock"
        >
          Ln 22, Col 1 | Spaces: 2 | UTF-8 | TypeScript
        </div>
      </div>
    </div>
  </div>
</template>
