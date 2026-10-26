import { ref, type Ref } from 'vue'
import type { E2eeConfig } from '~/types/chat'
import {
  deriveKey,
  exportKeyRaw,
  importKeyRaw,
  verifyKeyWithConfig,
} from '~/utils/crypto'

export const E2EE_SESSION_STORAGE_KEY = 'nuxt-chat-e2ee-key'
export const DEFAULT_E2EE_PHRASE = 'nuxt-chat-default-workspace-phrase-2026'

export const DEFAULT_E2EE_CONFIG: E2eeConfig = {
  id: 1,
  salt: 'R59PQPVU53Wpr0fvlsEpCA',
  iterations: 600000,
  verifier: 'e2ee:v1:tSRqP5o9-D29MLTe:bTkkzKQAj2OTF3U0QmkLrPOOrPr3FZMbGy4ARXzRio0WyWCHag3K3OiP',
}

export type E2eeStatus = 'loading' | 'unconfigured' | 'locked' | 'unlocked'

const testKeyRef = ref<CryptoKey | null>(null)
const testStatusRef = ref<E2eeStatus>('loading')
const testErrorRef = ref<string | null>(null)
const testIsUnlockingRef = ref<boolean>(false)
const testConfigRef = ref<E2eeConfig | null>(null)

function getE2eeState() {
  const key = typeof useState !== 'undefined'
    ? useState<CryptoKey | null>('e2ee-key', () => null)
    : testKeyRef
  const status = typeof useState !== 'undefined'
    ? useState<E2eeStatus>('e2ee-status', () => 'loading')
    : testStatusRef
  const error = typeof useState !== 'undefined'
    ? useState<string | null>('e2ee-error', () => null)
    : testErrorRef
  const isUnlocking = typeof useState !== 'undefined'
    ? useState<boolean>('e2ee-is-unlocking', () => false)
    : testIsUnlockingRef
  const config = typeof useState !== 'undefined'
    ? useState<E2eeConfig | null>('e2ee-config', () => null)
    : testConfigRef

  return { key, status, error, isUnlocking, config }
}

export function clearE2eeSession(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(E2EE_SESSION_STORAGE_KEY)
  }
  const { key, status, error, isUnlocking, config } = getE2eeState()
  key.value = null
  status.value = 'locked'
  error.value = null
  isUnlocking.value = false
  config.value = null
}

export function useE2ee(): {
  key: Ref<CryptoKey | null>
  status: Ref<E2eeStatus>
  error: Ref<string | null>
  isUnlocking: Ref<boolean>
  initializeE2ee: () => Promise<E2eeStatus>
  unlockWithPhrase: (phrase: string) => Promise<boolean>
  clearE2eeSession: () => void
} {
  const supabase = useSupabaseClient()
  const { key, status, error, isUnlocking, config } = getE2eeState()

  async function initializeE2ee(): Promise<E2eeStatus> {
    try {
      const { data, error: fetchErr } = await supabase
        .from('e2ee_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle()

      const activeConfig: E2eeConfig = fetchErr || !data ? DEFAULT_E2EE_CONFIG : data
      config.value = activeConfig

      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(E2EE_SESSION_STORAGE_KEY)
        if (stored) {
          try {
            const importedKey = await importKeyRaw(stored)
            const isValid = await verifyKeyWithConfig(importedKey, activeConfig)
            if (isValid) {
              key.value = importedKey
              status.value = 'unlocked'
              error.value = null
              return 'unlocked'
            }
          } catch {
            // Failed to import or verify stored key
          }
          sessionStorage.removeItem(E2EE_SESSION_STORAGE_KEY)
          key.value = null
        }
      }

      try {
        const defaultKey = await deriveKey(
          DEFAULT_E2EE_PHRASE,
          activeConfig.salt,
          activeConfig.iterations
        )
        const isDefaultValid = await verifyKeyWithConfig(defaultKey, activeConfig)

        if (isDefaultValid) {
          key.value = defaultKey
          status.value = 'unlocked'
          error.value = null
          if (typeof sessionStorage !== 'undefined') {
            const exported = await exportKeyRaw(defaultKey)
            sessionStorage.setItem(E2EE_SESSION_STORAGE_KEY, exported)
          }
          return 'unlocked'
        }
      } catch {
        // Fall through to locked
      }

      key.value = null
      status.value = 'locked'
      return 'locked'
    } catch {
      config.value = DEFAULT_E2EE_CONFIG
      key.value = null
      status.value = 'locked'
      return 'locked'
    }
  }

  async function unlockWithPhrase(phrase: string): Promise<boolean> {
    error.value = null
    isUnlocking.value = true
    try {
      let cfg = config.value
      if (!cfg) {
        const { data, error: fetchErr } = await supabase
          .from('e2ee_config')
          .select('*')
          .eq('id', 1)
          .maybeSingle()

        cfg = fetchErr || !data ? DEFAULT_E2EE_CONFIG : data
        config.value = cfg
      }

      const derivedKey = await deriveKey(phrase, cfg.salt, cfg.iterations)
      const isValid = await verifyKeyWithConfig(derivedKey, cfg)

      if (!isValid) {
        error.value = 'Incorrect secret phrase.'
        status.value = 'locked'
        return false
      }

      key.value = derivedKey
      status.value = 'unlocked'
      error.value = null

      if (typeof sessionStorage !== 'undefined') {
        const exported = await exportKeyRaw(derivedKey)
        sessionStorage.setItem(E2EE_SESSION_STORAGE_KEY, exported)
      }

      return true
    } catch (err: any) {
      error.value = err?.message || 'Failed to unlock encryption.'
      return false
    } finally {
      isUnlocking.value = false
    }
  }

  return {
    key,
    status,
    error,
    isUnlocking,
    initializeE2ee,
    unlockWithPhrase,
    clearE2eeSession,
  }
}
