import { ref } from 'vue'

export interface IncenseEvent {
  id: string
  client_id: string
  conversation_id: string
  user_id: string
  created_at: string
  actor: { id: string; display_name: string } | null
}
export interface IncenseRepository {
  list: (conversationId: string) => Promise<IncenseEvent[]>
  record: (conversationId: string, clientId: string) => Promise<IncenseEvent>
  uuid?: () => string
}

/** No optimistic shared history: only a confirmed database row is a completed offering. */
export function createIncenseActivity(repository: IncenseRepository) {
  const status = ref<'idle' | 'loading' | 'ready' | 'saving' | 'success' | 'error' | 'unavailable'>('idle')
  const history = ref<IncenseEvent[]>([])
  const error = ref('')
  let conversationId = '', actorId = ''
  let inFlight: Promise<void> | null = null
  let clientId: string | null = null
  let generation = 0
  let authorized = false

  function close() {
    generation++
    authorized = false
    conversationId = actorId = ''
    clientId = null
    inFlight = null
    history.value = []
    error.value = ''
    status.value = 'idle'
  }

  function fail(cause: unknown) {
    const code = (cause as { code?: string })?.code
    const unavailable = ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code ?? '')
    status.value = unavailable ? 'unavailable' : 'error'
    error.value = unavailable ? 'Khoảng sân chưa sẵn sàng. Quản trị viên cần cập nhật cơ sở dữ liệu.'
      : code === 'P0001' ? 'Vui lòng đợi một phút trước khi thắp thêm.'
      : code === '42501' ? 'Bạn cần đăng nhập và là thành viên cuộc trò chuyện này.'
      : 'Không thể kết nối. Chưa xác nhận nén hương; bạn có thể thử lại.'
  }
  async function open(conversation: string, actor: string) {
    close()
    if (!conversation || !actor) return
    const token = generation
    conversationId = conversation
    actorId = actor
    status.value = 'loading'
    try {
      const rows = await repository.list(conversation)
      if (token !== generation) return
      history.value = rows
      authorized = true
      status.value = 'ready'
    } catch (cause) { if (token === generation) fail(cause) }
  }
  function offer(): Promise<void> {
    if (inFlight) return inFlight
    if (!authorized || !conversationId || !actorId || status.value === 'unavailable') return Promise.resolve()
    const token = generation
    status.value = 'saving'
    error.value = ''
    clientId ??= (repository.uuid ?? (() => crypto.randomUUID()))()
    const request = repository.record(conversationId, clientId).then(row => {
      if (token !== generation) return
      history.value = [row, ...history.value.filter(item => item.id !== row.id)].slice(0, 30)
      status.value = 'success'
      clientId = null
    }).catch(cause => { if (token === generation) fail(cause) }).finally(() => {
      if (token === generation) inFlight = null
    })
    inFlight = request
    return request
  }
  return { status, history, error, open, offer, close }
}
