<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { createIncenseActivity, type IncenseRepository } from '~/composables/useIncenseActivity'
import { loadCourtyard, type CourtyardHandle } from '~/utils/incense/loadCourtyard'

const props = defineProps<{ conversationId: string; actorId: string; roomTitle: string; repository: IncenseRepository; profileFeedback?: string }>()
const emit = defineEmits<{ close: []; viewProfile: [userId: string] }>()
const activity = createIncenseActivity(props.repository)
const { status, history, error } = activity
const dialog = ref<HTMLElement | null>(null), stage = ref<HTMLElement | null>(null)
const titleId = useId()
const sceneReady = ref(false), sceneError = ref(false), animating = ref(false), reduced = ref(false), historyOpen = ref(false)
const phase = ref('Một lời nguyện lành, không cần thành tiếng.')
const subtitle = ref('Dừng lại một chút, rồi dâng một nén hương.')
const progress = ref(0), clock = ref(Date.now())
let renderer: CourtyardHandle | null = null, controller: AbortController | null = null
let mounted = false, generation = 0, timer: ReturnType<typeof setInterval> | null = null
let motionQuery: MediaQueryList | null = null, previousFocus: HTMLElement | null = null
const canOffer = computed(() => !animating.value && ['ready', 'success'].includes(status.value) && (sceneReady.value || sceneError.value))

function relative(iso: string) {
  const minutes = Math.max(0, Math.floor((clock.value - Date.parse(iso)) / 60000))
  if (minutes < 1) return 'vừa xong'
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
  return minutes < 60 ? formatter.format(-minutes, 'minute') : minutes < 1440 ? formatter.format(-Math.floor(minutes / 60), 'hour') : formatter.format(-Math.floor(minutes / 1440), 'day')
}
function exact(iso: string) { return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'full', timeStyle: 'medium' }) }
function disposeScene() {
  generation++
  controller?.abort()
  controller = null
  renderer?.dispose()
  renderer = null
  sceneReady.value = false
  animating.value = false
}
async function initialize() {
  disposeScene()
  sceneError.value = false
  const token = generation
  await activity.open(props.conversationId, props.actorId)
  if (!mounted || token !== generation || status.value !== 'ready') return
  controller = new AbortController()
  const signal = controller.signal
  try {
    const { createCourtyard } = await loadCourtyard()
    if (signal.aborted || token !== generation || !stage.value) return
    const active = () => !signal.aborted && token === generation
    renderer = createCourtyard(stage.value, {
      signal, reducedMotion: reduced.value,
      onReady: () => { if (active()) sceneReady.value = true },
      onError: () => { if (active()) { sceneReady.value = false; sceneError.value = true; animating.value = false } },
      onPhase: (text, sub, fraction) => { if (active()) { phase.value = text; subtitle.value = sub; progress.value = fraction } },
      onComplete: () => { if (active()) void persist(token) },
    })
  } catch {
    if (token === generation) sceneError.value = true
  }
}
async function persist(token = generation) {
  animating.value = false
  await activity.offer()
  if (!mounted || token !== generation) return
  if (status.value === 'success') renderer?.confirm()
  else renderer?.rollback()
}
function offer() {
  if (!canOffer.value) return
  phase.value = 'Chậm bước đến sân.'
  if (sceneError.value) { void persist(); return }
  animating.value = true
  renderer?.start()
}
function skip() { renderer?.skip() }
function changeMotion() { renderer?.setReducedMotion(reduced.value) }
function systemMotion(event: MediaQueryListEvent) { reduced.value = event.matches; changeMotion() }
function resetView() { renderer?.resetView() }
function retrySave() { if (status.value === 'error') void persist() }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')).filter(el => el.getClientRects().length)
  const first = controls[0], last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(() => {
  mounted = true
  previousFocus = document.activeElement as HTMLElement | null
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced.value = motionQuery.matches
  motionQuery.addEventListener('change', systemMotion)
  timer = setInterval(() => { clock.value = Date.now() }, 30000)
  void initialize()
  void nextTick(() => dialog.value?.querySelector<HTMLButtonElement>('[data-test="incense-close"]')?.focus())
})
watch(() => [props.conversationId, props.actorId], () => { if (mounted) void initialize() })
onBeforeUnmount(() => {
  mounted = false
  disposeScene()
  activity.close()
  motionQuery?.removeEventListener('change', systemMotion)
  if (timer) clearInterval(timer)
  if (previousFocus?.isConnected) previousFocus.focus()
})
</script>

<template>
  <div class="incense-backdrop" @click.self="emit('close')">
    <section ref="dialog" class="incense-courtyard" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown="keydown">
      <header>
        <div class="brand"><span class="seal" aria-hidden="true">安</span><div><h1 :id="titleId">Một nén bình an</h1><small>MỘT KHOẢNG LẶNG CHO MÌNH</small></div></div>
        <button data-test="incense-close" type="button" aria-label="Đóng khoảng sân" @click="emit('close')">Đóng ×</button>
      </header>
      <div class="courtyard-body">
        <main class="experience">
          <div class="scene-heading"><h2>Một khoảng sân. Một chút an.</h2><span>Không vội. Không ồn.</span></div>
          <div class="stage" role="region" aria-label="Sân gạch chiều Việt Nam, mái ngói, lư hương đồng và nhân vật 3D">
            <div ref="stage" class="canvas-host" />
            <div class="place">SÂN CHIỀU<span>Ánh sáng minh họa · Nắng qua hiên</span></div>
            <div v-if="status === 'loading' || (!sceneReady && !sceneError && status === 'ready')" class="loading" role="status">Đang mở khoảng sân…</div>
            <div v-if="sceneError" class="loading fallback" role="status">Không thể mở cảnh 3D trên thiết bị này. Bạn vẫn có thể gửi một nén hương bằng nút bên dưới.</div>
            <div v-if="status === 'unavailable' || (status === 'error' && !sceneReady && !sceneError)" class="loading fallback">{{ error }}</div>
            <button v-if="sceneReady" class="reset" type="button" @click="resetView">↶ Góc nhìn</button>
            <span v-if="sceneReady" class="orbit-hint">Kéo để ngắm sân</span>
          </div>
          <div class="ritual">
            <div class="ritual-copy"><p aria-live="polite">{{ status === 'saving' ? 'Đang ghi nhận nén hương…' : phase }}</p><span>{{ subtitle }}</span></div>
            <div class="actions">
              <button v-if="animating" type="button" data-test="incense-skip" @click="skip">Bỏ qua chuyển động</button>
              <button type="button" class="offer" data-test="incense-offer" :disabled="!canOffer" @click="offer">Thắp nhang <span>↗</span></button>
            </div>
            <div v-if="animating" class="progress" role="progressbar" aria-label="Dâng hương" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100"><i :style="{ width: `${progress * 100}%` }" /></div>
          </div>
          <p v-if="status === 'success' && !animating" data-test="incense-feedback" class="feedback" role="status">✓ Đã gửi một nén hương. Mong lòng được an.</p>
          <div v-if="error" class="feedback error" role="alert"><p>{{ error }}</p><button v-if="sceneReady || sceneError" :disabled="status !== 'error'" type="button" data-test="incense-retry" @click="retrySave">Thử ghi nhận lại</button><button v-else type="button" @click="initialize">Tải lại</button></div>
          <div class="caption"><span>Không gian minh họa · Không gắn với cơ sở tín ngưỡng cụ thể</span><label><input v-model="reduced" type="checkbox" data-test="incense-motion" @change="changeMotion"> Giảm chuyển động</label></div>
        </main>
        <aside :class="{ open: historyOpen }">
          <div class="history-title"><div><span class="eyebrow">NHỮNG KHOẢNH KHẮC</span><h2>Dấu hương <small>{{ history.length }}</small></h2></div><button type="button" class="history-toggle" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">{{ historyOpen ? 'Thu gọn' : 'Mở lịch sử' }}</button></div>
          <p class="room-title">{{ roomTitle }}</p>
          <p v-if="profileFeedback" class="feedback" data-test="incense-profile-feedback" role="status">{{ profileFeedback }}</p>
          <div class="history-body">
            <p class="aside-intro">Những nén hương trong cuộc trò chuyện này.</p>
            <ol class="history"><li v-for="event in history" :key="event.id"><span class="mark" aria-hidden="true">⌁</span><div><strong>Một nén bình an</strong><button type="button" class="actor" @click="emit('viewProfile', event.user_id)">{{ event.actor?.display_name || 'Thành viên' }}</button><time :datetime="event.created_at" :title="exact(event.created_at)">{{ relative(event.created_at) }}</time></div></li></ol>
            <div v-if="!history.length && ['ready', 'saving', 'success'].includes(status)" class="empty"><span aria-hidden="true">⌁</span><p>Sân còn yên,<br>hương chưa thắp.</p></div>
            <div class="shared-note"><strong>CHỈ THÀNH VIÊN CUỘC TRÒ CHUYỆN</strong><p>Chỉ ghi tên và thời điểm sau khi bạn chủ động thắp nhang. Không lưu lời nguyện, không tự công bố người đang online. Lịch sử không phải tin nhắn mã hóa đầu cuối.</p><a href="/incense/CREDITS.md" target="_blank" rel="noopener">Nguồn mô hình &amp; giấy phép ↗</a></div>
          </div>
        </aside>
      </div>
      <footer>Một điều lành nhỏ, lưu lại ở đây. <span>Không phải nghi lễ hoặc dịch vụ ngoài đời.</span></footer>
    </section>
  </div>
</template>

<style scoped>
.incense-backdrop { position: fixed; inset: 0; z-index: 60; padding: 16px; display: grid; place-items: center; background: #131810b3; }
.incense-courtyard { --paper: #ece8de; --ink: #313b33; --muted: #626756; --line: #c5c6b7; --accent: #536146; width: min(1440px, 100%); max-height: 94dvh; display: flex; flex-direction: column; overflow: hidden; color: var(--ink); background: var(--paper); font-family: 'Segoe UI', Arial, sans-serif; }
:global(.dark .incense-courtyard) { --paper: #242b24; --ink: #e4e7d9; --muted: #b4bbaa; --line: #4b5548; --accent: #536146; }
.incense-courtyard * { box-sizing: border-box; }
button { font: inherit; cursor: pointer; min-height: 44px; border: 1px solid var(--line); color: inherit; background: transparent; padding: 0 16px; }
button:hover { background: #7c876420; } button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 3px solid #a9773e; outline-offset: 2px; }
header { min-height: 82px; padding: 12px 3%; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
.brand { display: flex; gap: 13px; align-items: center; } h1 { font: 23px Georgia, serif; margin: 0; } .seal { border: 1px solid #a46d4c; color: #a46d4c; font-size: 26px; width: 39px; height: 44px; display: grid; place-items: center; flex-shrink: 0; }
.brand small { display: block; font-size: 9px; letter-spacing: 2px; margin-top: 7px; }
.courtyard-body { display: grid; grid-template-columns: minmax(0,1fr) 244px; gap: 28px; padding: 0 3%; overflow-y: auto; min-height: 0; }
.experience { min-width: 0; } .scene-heading { min-height: 66px; display: flex; align-items: center; justify-content: space-between; gap: 10px; } .scene-heading h2 { font: 25px Georgia, serif; margin: 0; } .scene-heading > span { font-size: 11px; color: var(--muted); }
.stage { height: clamp(300px, 53dvh, 670px); position: relative; background: #aaa994; overflow: hidden; } .canvas-host { position: absolute; inset: 0; } .canvas-host :deep(canvas) { display: block; width: 100%; height: 100%; max-width: 100%; }
.place { position: absolute; pointer-events: none; z-index: 2; top: 23px; left: 24px; font-size: 10px; font-weight: 600; letter-spacing: 2px; color: #faf1dc; text-shadow: 0 1px 5px #343b2b; } .place span { display: block; font-weight: 400; font-size: 11px; letter-spacing: .3px; margin-top: 8px; }
.loading { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; padding: 24px; text-align: center; background: var(--paper); color: var(--ink); font-size: 14px; } .fallback { line-height: 1.8; }
.reset { position: absolute; z-index: 2; bottom: 16px; right: 18px; background: #eee8d9ed; color: #313b33; border: 0; font-size: 11px; } .orbit-hint { position: absolute; pointer-events: none; left: 24px; bottom: 30px; color: #f1ebdc; text-shadow: 0 1px 4px #222; font-size: 10px; }
.ritual { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 20px 0; border-bottom: 1px solid var(--line); } .ritual-copy p { font: 18px Georgia, serif; margin: 0 0 7px; } .ritual-copy > span { font-size: 11px; color: var(--muted); } .actions { display: flex; gap: 8px; flex-shrink: 0; } .offer { background: var(--accent); border-color: var(--accent); color: #fff5de; min-width: 154px; height: 49px; font-size: 13px; } .offer:hover { background: #414d36; } .offer span { padding-left: 22px; }
.progress { position: absolute; bottom: -1px; left: 0; width: 100%; height: 2px; background: var(--line); } .progress i { display: block; height: 100%; background: #7c8764; }
.caption { padding: 10px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 10px; color: var(--muted); } .caption label { white-space: nowrap; display: flex; gap: 7px; align-items: center; cursor: pointer; min-height: 44px; } .caption input { accent-color: var(--accent); width: 16px; height: 16px; }
aside { border-left: 1px solid var(--line); padding: 27px 0 12px 24px; margin-top: 24px; min-width: 0; } .eyebrow { font-size: 9px; letter-spacing: 1.6px; } aside h2 { font: 32px Georgia, serif; margin: 13px 0 16px; } h2 small { font: 11px 'Segoe UI', sans-serif; color: var(--muted); padding-left: 18px; } .room-title { font-size: 12px; overflow-wrap: anywhere; margin: 0 0 16px; } .aside-intro { font-size: 12px; color: var(--muted); margin: 0 0 20px; }
.history { list-style: none; padding: 0; margin: 0; max-height: 285px; overflow: auto; } .history li { border-bottom: 1px solid var(--line); padding: 12px 0; display: flex; gap: 12px; } .history li > div { min-width: 0; overflow-wrap: anywhere; } .mark { font-size: 25px; color: #919e76; } .history strong { font-size: 12px; font-weight: 500; display: block; margin-bottom: 2px; } .history time { display: block; font-size: 11px; color: var(--muted); } .actor { display: block; text-align: left; border: 0; padding: 0; font-size: 12px; overflow-wrap: anywhere; }
.empty { min-height: 160px; display: flex; flex-direction: column; justify-content: center; } .empty > span { font-size: 48px; color: #a0a88c; } .empty p { font: 23px/1.5 Georgia,serif; color: var(--muted); margin: 12px 0; }
.shared-note { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 20px; color: var(--muted); } .shared-note strong { font-size: 9px; letter-spacing: 1px; font-weight: 500; } .shared-note p { font-size: 11px; line-height: 1.8; } .shared-note a { font-size: 11px; color: var(--ink); text-decoration: underline; } .history-toggle { display: none; }
.feedback { font-size: 13px; padding: 12px 0; margin: 0; color: var(--ink); } .error p { margin: 0 0 8px; } footer { margin: 0 3%; border-top: 1px solid var(--line); padding: 14px 0; display: flex; justify-content: space-between; gap: 12px; font-size: 10px; color: var(--muted); flex-shrink: 0; }
@media (max-height: 700px) and (min-width: 761px) { .stage { height: max(160px, calc(94dvh - 320px)); } }
@media (max-width: 1000px) { .courtyard-body { gap: 18px; grid-template-columns: minmax(0,1fr) 210px; } .ritual { flex-wrap: wrap; } .ritual-copy { width: 100%; } .scene-heading > span { display: none; } }
@media (max-width: 760px) { .incense-backdrop { padding: 0; } .incense-courtyard { max-height: 100dvh; height: 100dvh; } header { min-height: 70px; padding: 10px 16px; } h1 { font-size: 20px; } .brand { gap: 10px; } .brand small { font-size: 7px; letter-spacing: 1.5px; } .seal { width: 32px; height: 38px; font-size: 23px; } header button { font-size: 12px; padding: 0 10px; }
.courtyard-body { grid-template-columns: minmax(0,1fr); gap: 0; padding: 0 12px; } .scene-heading { min-height: 58px; padding: 0 4px; } .scene-heading h2 { font-size: 21px; } .stage { height: clamp(240px, 43dvh, 520px); } .place { left: 16px; top: 17px; font-size: 9px; } .place span { font-size: 10px; } .orbit-hint { left: 16px; font-size: 9px; } .reset { right: 12px; bottom: 12px; font-size: 10px; padding: 0 12px; }
.ritual { padding: 15px 4px; gap: 13px; } .ritual-copy p { font-size: 18px; } .ritual-copy > span { font-size: 10px; } .actions { width: 100%; flex-direction: row-reverse; } .actions button { padding: 0 10px; } .offer { flex: 1; height: 47px; min-width: 130px; } .caption { padding: 5px 4px; gap: 5px; } .caption > span { max-width: 195px; line-height: 1.6; font-size: 9px; } .caption label { font-size: 10px; }
aside { margin: 0; padding: 8px 4px; border: 0; border-top: 1px solid var(--line); } .history-title { display: flex; align-items: center; justify-content: space-between; } .eyebrow { display: none; } aside h2 { font-size: 21px; margin: 0; } .history-toggle { display: block; font-size: 11px; border: 0; } .history-body { display: none; } aside.open .history-body { display: block; } .room-title { margin: 0 0 8px; } .shared-note { margin-top: 10px; } .empty { min-height: 130px; } footer { padding: 10px 0; font-size: 9px; } footer span { display: none; }
}
</style>
