<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { StreetParticipant } from '~/types/street'

const illustrationId = useId()
const svgId = (name: string) => `${illustrationId}-${name}`
const paused = ref(false)

const props = withDefaults(
  defineProps<{
    participants: StreetParticipant[]
    currentUserId: string
    joined: boolean
    status: 'idle' | 'connecting' | 'connected' | 'error'
    error?: string | null
    teaNotice?: { user_id: string; id: string; at: number } | null
    speech?: Record<string, string>
    roomTitle?: string
    enabled?: boolean
  }>(),
  {
    enabled: true,
    error: null,
    teaNotice: null,
    speech: () => ({}),
    roomTitle: 'Trà đá đầu ngõ',
  },
)
const emit = defineEmits<{
  join: []
  leave: []
  inviteTea: []
  viewProfile: [userId: string]
}>()
const blocked = computed(() => !props.enabled || props.status === 'connecting')
function join() {
  if (!blocked.value && !props.joined) emit('join')
}
function leave() {
  if (!blocked.value && props.joined) emit('leave')
}
const canInviteTea = computed(
  () => props.enabled && props.joined && props.status === 'connected',
)
function inviteTea() {
  if (canInviteTea.value) emit('inviteTea')
}
const seats = [
  [275, 413],
  [422, 409],
  [352, 485],
  [696, 425],
  [829, 472],
  [610, 493],
] as const
const roster = computed(() =>
  [...props.participants].sort(
    (a, b) => a.seat - b.seat || a.user_id.localeCompare(b.user_id),
  ),
)
const seated = computed(() => {
  const available = new Set(seats.map((_, index) => index))
  return roster.value.slice(0, seats.length).map((person) => {
    const preferred = Number.isInteger(person.seat)
      ? ((person.seat % seats.length) + seats.length) % seats.length
      : 0
    const seat = available.has(preferred)
      ? preferred
      : available.values().next().value!
    available.delete(seat)
    return { ...person, position: seats[seat]!, seatIndex: seat }
  })
})
const emptySeat = computed(() =>
  seats.find(
    (_, index) => !seated.value.some((person) => person.seatIndex === index),
  ),
)
function bounded(value: string, limit: number) {
  const text = (value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text
}
function label(person: StreetParticipant) {
  return bounded(person.display_name, 18) || 'Người bạn'
}
function color(value: string) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#809380'
}
const teaInviter = computed(
  () =>
    props.teaNotice &&
    roster.value.find((person) => person.user_id === props.teaNotice?.user_id),
)
function profile(userId: string) {
  emit('viewProfile', userId)
}
</script>

<template>
  <section class="street-world" :class="{ paused }" aria-label="Góc phố">
    <div class="scene">
      <div class="location">
        <strong data-test="street-title">{{ bounded(roomTitle, 60) }}</strong
        ><small>Gió nhẹ. Trà mát. Chuyện còn dài.</small>
      </div>
      <svg
        viewBox="0 0 1000 710"
        preserveAspectRatio="xMidYMid slice"
        role="group"
        aria-label="Minh họa góc phố Việt Nam với quán trà đá, ghế nhựa, cây xanh và bạn bè"
      >
        <defs>
          <pattern
            :id="svgId('wall')"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="3" r=".7" fill="#8f7955" opacity=".14" />
          </pattern>
          <pattern
            :id="svgId('pave')"
            width="90"
            height="38"
            patternUnits="userSpaceOnUse"
            patternTransform="skewX(-22)"
          >
            <path
              d="M0 0H90V38H0Z"
              fill="none"
              stroke="#b7b7a0"
              stroke-width="1"
            />
          </pattern>
          <g :id="svgId('stool')">
            <path
              d="M-18 0L-22 40M18 0L23 40M-15 26H18"
              stroke="#3e786c"
              stroke-width="7"
            />
            <ellipse
              rx="25"
              ry="9"
              fill="#5b9687"
              stroke="#376d61"
              stroke-width="2"
            />
          </g>
          <g :id="svgId('cup')">
            <path
              d="M-5-12L-4 0H5L6-12Z"
              fill="#d9e4cb"
              stroke="#668065"
              stroke-width="1.3"
            />
            <path d="M-3-6H4" stroke="#a6a550" stroke-width="4" />
          </g>
          <g :id="svgId('person')">
            <ellipse
              cx="0"
              cy="58"
              rx="31"
              ry="9"
              fill="#6e786b"
              opacity=".15"
            />
            <use :href="`#${svgId('stool')}`" y="20" />
            <path
              d="M-12 21L-15 52M10 21L22 46"
              stroke="#435669"
              stroke-width="10"
              stroke-linecap="round"
            />
            <path d="M-17-17Q0-27 17-16L20 22H-18Z" fill="currentColor" />
            <path
              d="M-15-9L-24 11L-4 15M15-9L28 7L17 13"
              fill="none"
              stroke="#d5a177"
              stroke-width="9"
              stroke-linecap="round"
            />
            <rect x="-5" y="-33" width="10" height="14" rx="3" fill="#c88f66" />
            <ellipse cy="-45" rx="16" ry="20" fill="#e5b58b" />
            <path
              d="M-16-44Q-22-73 5-66Q24-63 17-39L10-52Q0-48-13-53Z"
              fill="#384136"
            />
            <circle cx="6" cy="-44" r="1.5" fill="#4b4534" />
            <path
              d="M2-35Q7-32 10-36"
              fill="none"
              stroke="#925d48"
              stroke-width="1.5"
            />
          </g>
          <g :id="svgId('bike')">
            <circle cx="10" cy="0" r="19" fill="#343c3a" />
            <circle cx="94" cy="0" r="19" fill="#343c3a" />
            <circle cx="10" cy="0" r="10" fill="#a5aba0" />
            <circle cx="94" cy="0" r="10" fill="#a5aba0" />
            <path d="M7-10L39-28H71L87-49H100L95-8H42Z" fill="#b46848" />
            <path
              d="M34-32H66"
              stroke="#3e423a"
              stroke-width="8"
              stroke-linecap="round"
            />
            <path
              d="M52-34L41-59L54-76L79-51L86-47"
              fill="none"
              stroke="#3f625a"
              stroke-width="12"
              stroke-linecap="round"
            />
            <path
              d="M47-40L65-20L51-10"
              fill="none"
              stroke="#3c4850"
              stroke-width="9"
            />
            <circle cx="57" cy="-90" r="12" fill="#d5a580" />
            <path d="M44-91Q45-111 61-104Q72-102 71-90Z" fill="#e3d3a4" />
          </g>
        </defs>
        <rect width="1000" height="710" fill="#d7dfcc" />
        <path
          d="M0 150L120 96L260 142L420 87L590 153L740 98L1000 145V330H0Z"
          fill="#bbc9b5"
        />
        <rect x="-20" y="155" width="230" height="260" fill="#cebfa1" />
        <rect x="10" y="183" width="64" height="110" fill="#7b9180" />
        <path d="M42 183V293M10 234H74" stroke="#b3bba3" stroke-width="5" />
        <rect x="100" y="170" width="96" height="188" fill="#b4a58a" />
        <path
          d="M112 178V349M128 178V349M144 178V349M160 178V349M176 178V349"
          stroke="#918a74"
          stroke-width="3"
        />
        <path d="M209 105H650V400H209Z" fill="#e3cea0" />
        <path d="M209 105H650V400H209Z" :fill="`url(#${svgId('wall')})`" />
        <path d="M198 112L434 56L665 112" fill="#737c63" />
        <path d="M218 109L434 64L643 109" fill="#879078" />
        <rect x="255" y="180" width="235" height="204" fill="#68745a" />
        <rect x="270" y="195" width="202" height="189" fill="#3e5143" />
        <rect
          x="505"
          y="177"
          width="104"
          height="121"
          fill="#b3b48b"
          stroke="#8a9671"
          stroke-width="5"
        />
        <path d="M557 179V296M506 235H607" stroke="#7a8d69" stroke-width="5" />
        <rect x="267" y="122" width="281" height="53" rx="3" fill="#385a45" />
        <text
          x="408"
          y="156"
          text-anchor="middle"
          fill="#f7e5b7"
          font-family="Georgia"
          font-size="30"
        >
          TRÀ ĐÁ · CÔ TƯ
        </text>
        <path d="M227 178H626L658 219H200Z" fill="#b66c4a" />
        <path
          d="M235 178L220 219M286 178L277 219M337 178L334 219M388 178L391 219M439 178L448 219M490 178L505 219M541 178L562 219M592 178L619 219"
          stroke="#e7c595"
          stroke-width="27"
        />
        <path
          d="M200 219H658V230Q643 241 629 230Q614 241 600 230Q585 241 571 230Q556 241 542 230Q527 241 513 230Q498 241 484 230Q469 241 455 230Q440 241 426 230Q411 241 397 230Q382 241 368 230Q353 241 339 230Q324 241 310 230Q295 241 281 230Q266 241 252 230Q237 241 223 230Q207 241 200 230Z"
          fill="#bc774f"
        />
        <rect x="275" y="310" width="170" height="69" fill="#ad9b70" />
        <rect x="266" y="300" width="186" height="13" rx="3" fill="#cfb88a" />
        <path
          d="M297 300V273H330V300M300 274Q313 261 326 274"
          fill="#9baf91"
          stroke="#d0d8b0"
          stroke-width="3"
        />
        <g fill="#e8dbb4">
          <rect x="350" y="284" width="12" height="16" />
          <rect x="370" y="284" width="12" height="16" />
        </g>
        <rect
          x="483"
          y="320"
          width="94"
          height="103"
          rx="3"
          fill="#46634a"
          stroke="#c0ac79"
          stroke-width="6"
          transform="rotate(4 530 370)"
        />
        <text
          x="532"
          y="347"
          text-anchor="middle"
          font-family="Georgia"
          fill="#eee1b8"
          font-size="15"
          transform="rotate(4 530 370)"
        >
          <tspan x="532">Trà đá</tspan>
          <tspan x="532" dy="25">Hướng dương</tspan>
          <tspan x="532" dy="25">Chuyện miễn phí</tspan>
        </text>
        <rect x="650" y="160" width="350" height="240" fill="#c4bea0" />
        <path
          d="M682 196H1000M682 210H1000"
          stroke="#acae92"
          stroke-width="4"
        />
        <rect x="883" y="230" width="75" height="170" fill="#82937e" />
        <path
          d="M892 235V397M905 235V397M918 235V397M931 235V397M944 235V397"
          stroke="#617b67"
          stroke-width="3"
        />
        <path d="M0 389H1000V555H0Z" fill="#cbc8b1" />
        <path d="M0 389H1000V555H0Z" :fill="`url(#${svgId('pave')})`" />
        <path d="M0 546H1000V570H0Z" fill="#a4aa95" />
        <path d="M0 560H1000V710H0Z" fill="#78887e" />
        <path d="M0 572H1000" stroke="#d2cdb3" stroke-width="3" />
        <path
          d="M-50 670H1050"
          stroke="#c2c5ab"
          stroke-width="4"
          stroke-dasharray="68 62"
          opacity=".6"
        />
        <path
          d="M778 407Q802 338 785 173L816 173Q801 333 825 408Z"
          fill="#7d8060"
        />
        <path
          d="M800 283L738 216M801 253L866 185"
          stroke="#7d8060"
          stroke-width="16"
        />
        <g class="leaf" fill="#6b8962">
          <ellipse cx="745" cy="151" rx="92" ry="65" />
          <ellipse cx="851" cy="136" rx="112" ry="79" />
          <ellipse cx="786" cy="87" rx="93" ry="62" />
          <ellipse cx="914" cy="189" rx="76" ry="55" />
          <ellipse cx="715" cy="212" rx="77" ry="47" />
          <ellipse cx="824" cy="208" rx="96" ry="58" />
        </g>
        <g fill="#829967" opacity=".8">
          <ellipse cx="750" cy="119" rx="48" ry="29" />
          <ellipse cx="858" cy="83" rx="58" ry="33" />
          <ellipse cx="891" cy="169" rx="52" ry="28" />
        </g>
        <path
          d="M115 115Q470 280 959 135"
          fill="none"
          stroke="#59634b"
          stroke-width="2"
        />
        <g fill="#f6dda0" stroke="#d2b277" stroke-width="2">
          <circle cx="208" cy="147" r="6" />
          <circle cx="312" cy="178" r="6" />
          <circle cx="422" cy="192" r="6" />
          <circle cx="532" cy="199" r="6" />
          <circle cx="645" cy="193" r="6" />
          <circle cx="756" cy="179" r="6" />
          <circle cx="867" cy="157" r="6" />
        </g>
        <ellipse
          cx="349"
          cy="473"
          rx="117"
          ry="25"
          fill="#737f6c"
          opacity=".13"
        />
        <path
          d="M324 435L314 488M375 435L385 488"
          stroke="#54775e"
          stroke-width="7"
        />
        <ellipse cx="350" cy="431" rx="63" ry="23" fill="#587e61" />
        <ellipse
          cx="350"
          cy="427"
          rx="63"
          ry="22"
          fill="#73936e"
          stroke="#4f7255"
          stroke-width="2"
        />
        <use :href="`#${svgId('cup')}`" x="329" y="423" />
        <use :href="`#${svgId('cup')}`" x="375" y="425" />
        <ellipse cx="352" cy="429" rx="11" ry="5" fill="#d5bf89" />
        <path
          d="M737 449L732 491M790 449L799 491"
          stroke="#52725d"
          stroke-width="6"
        />
        <ellipse cx="764" cy="440" rx="46" ry="18" fill="#75916b" />
        <use :href="`#${svgId('cup')}`" x="758" y="437" />
        <use :href="`#${svgId('stool')}`" x="829" y="472" />
        <g fill="#587b59">
          <path
            d="M96 410L86 355Q112 366 104 403Q99 361 119 348Q126 382 105 410Q111 384 136 382Q134 409 109 416Z"
          />
          <path
            d="M905 429Q873 394 889 377Q912 387 906 417Q910 374 930 373Q939 401 914 425Q929 398 948 407Q948 429 918 435Z"
          />
        </g>
        <path d="M79 405H125L117 444H88Z" fill="#aa7859" />
        <path d="M887 425H937L930 459H895Z" fill="#a97955" />
        <g class="traffic"><use :href="`#${svgId('bike')}`" x="0" y="621" /></g>
        <g class="traffic2" opacity=".7">
          <use :href="`#${svgId('bike')}`" x="0" y="703" />
        </g>
        <g
          v-for="person in seated"
          :key="person.user_id"
          data-test="street-person"
          role="button"
          tabindex="0"
          :aria-label="`Xem hồ sơ ${label(person)}`"
          @click="profile(person.user_id)"
          @keydown.enter.prevent="profile(person.user_id)"
          @keydown.space.prevent="profile(person.user_id)"
          :data-user-id="person.user_id"
          :transform="`translate(${person.position[0]} ${person.position[1]})`"
        >
          <g
            v-if="speech[person.user_id]"
            data-test="street-speech"
            class="speech"
          >
            <rect
              x="-112"
              y="-126"
              width="224"
              height="42"
              rx="12"
              fill="#fff9e8"
            />
            <path d="M-8-85L0-73L5-85" fill="#fff9e8" />
            <text y="-101" text-anchor="middle" font-size="12" fill="#4d5c46">
              {{ bounded(speech[person.user_id]!, 40) }}
            </text>
          </g>
          <use
            :href="`#${svgId('person')}`"
            :style="{ color: color(person.avatar_color) }"
          />
          <rect x="-60" y="66" width="120" height="26" rx="13" fill="#f3edda" />
          <text y="84" text-anchor="middle" font-size="13" fill="#354b39">
            {{ label(person)
            }}{{ person.user_id === currentUserId ? ' · Bạn' : '' }}
          </text>
        </g>
        <g
          v-if="!joined && emptySeat"
          :transform="`translate(${emptySeat[0] - 350} ${emptySeat[1] - 485})`"
          data-test="street-empty-seat"
          role="button"
          :tabindex="blocked ? -1 : 0"
          :aria-disabled="blocked"
          aria-label="Ngồi vào bàn trà"
          @click="join"
          @keydown.enter.prevent="join"
          @keydown.space.prevent="join"
        >
          <ellipse
            cx="350"
            cy="502"
            rx="35"
            ry="17"
            fill="none"
            stroke="#f6f0d4"
            stroke-width="2"
            stroke-dasharray="5 4"
          />
          <use :href="`#${svgId('stool')}`" x="350" y="498" />
          <rect
            x="298"
            y="538"
            width="104"
            height="30"
            rx="12"
            fill="#fcf6df"
          />
          <text
            x="350"
            y="558"
            text-anchor="middle"
            font-size="14"
            fill="#456349"
          >
            + Ngồi đây
          </text>
        </g>
      </svg>
      <div
        v-if="teaInviter"
        :key="teaNotice?.id"
        class="tea-notice"
        role="status"
        data-test="street-tea-notice"
      >
        {{ label(teaInviter) }} mời cả bàn một vòng trà mát!
      </div>
    </div>
    <div class="roster" aria-label="Người đang ở phố" v-if="roster.length">
      <span>{{ roster.length }} người đang ở phố</span
      ><button
        v-for="person in roster"
        :key="person.user_id"
        data-test="street-roster-member"
        @click="profile(person.user_id)"
      >
        {{ label(person)
        }}{{ person.user_id === currentUserId ? ' · Bạn' : '' }}
      </button>
    </div>
    <div class="worldbar">
      <div>
        <p v-if="!enabled">Chọn một nhóm để ra phố cùng bạn bè.</p>
        <p v-else-if="status === 'connecting'" role="status">
          Đang kết nối với bàn trà…
        </p>
        <p v-else-if="joined">Bạn đang ngồi cùng bàn. Kể chuyện hôm nay nhé.</p>
        <p v-else-if="roster.length">Có một chiếc ghế đang chờ bạn.</p>
        <p v-else>Chưa có ai ở phố. Ngồi xuống và rủ bạn bè làm ly trà.</p>
        <p v-if="status === 'error'" role="alert">
          {{ error || 'Không thể kết nối. Thử ngồi lại nhé.' }}
        </p>
      </div>
      <div class="actions">
        <button
          data-test="street-motion"
          :aria-pressed="paused"
          :aria-label="paused ? 'Tiếp tục chuyển động' : 'Tạm dừng chuyển động'"
          @click="paused = !paused"
        >
          {{ paused ? '▷' : 'Ⅱ' }}</button
        ><button
          data-test="street-tea"
          :disabled="!canInviteTea"
          @click="inviteTea"
        >
          Mời trà</button
        ><button
          v-if="joined"
          data-test="street-leave"
          :disabled="blocked"
          @click="leave"
        >
          Rời bàn</button
        ><button
          v-else
          data-test="street-join"
          :disabled="blocked"
          @click="join"
        >
          Ngồi cùng bàn
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.street-world {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: #fbf9f0;
  color: #283c38;
  overflow: hidden;
  isolation: isolate;
  font-family: 'Segoe UI', sans-serif;
  border-radius: 16px;
  border: 1px solid #b8c5b5;
}
.scene {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #d5dece;
  overflow: hidden;
}
.scene > svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.location {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 1;
  max-width: calc(100% - 32px);
  padding: 10px 14px;
  border-radius: 10px;
  background: #fff9e7ed;
  box-shadow: 0 3px 12px #3c4d3412;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.location strong {
  display: block;
  font:
    20px Georgia,
    serif;
}
.location small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #52624c;
}
.tea-notice {
  position: absolute;
  z-index: 2;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100% - 32px);
  padding: 10px 16px;
  border-radius: 10px;
  background: #fff7db;
  color: #294738;
  box-shadow: 0 4px 18px #233e3620;
  font-size: 14px;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.worldbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 12px;
  padding: 14px 18px;
  border-top: 1px solid #d2d9c9;
}
.worldbar > div:first-child {
  min-width: 0;
}
.worldbar p {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  overflow-wrap: anywhere;
}
.worldbar [role='alert'] {
  color: #8b3525;
  margin-top: 4px;
}
.actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}
button {
  min-height: 44px;
  min-width: 44px;
  border: 1px solid #c4cebd;
  border-radius: 10px;
  background: #fffdf6;
  color: #28443c;
  padding: 8px 14px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: #e8efdf;
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
button[data-test='street-join'] {
  background: #385a45;
  color: #fff5d8;
  border-color: #385a45;
}
button[data-test='street-join']:hover:not(:disabled) {
  background: #284536;
}
button:focus-visible,
svg [role='button']:focus-visible {
  outline: 3px solid #a9602a;
  outline-offset: 3px;
}
svg [role='button'] {
  cursor: pointer;
}
svg [aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.6;
}
.roster {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  overflow-x: auto;
  border-top: 1px solid #d2d9c9;
  scrollbar-width: thin;
}
.roster > span {
  white-space: nowrap;
  font-size: 12px;
  color: #52624c;
}
.roster button {
  flex-shrink: 0;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 767px) {
  .street-world {
    height: 100%;
    min-height: 0;
    border-radius: 12px;
  }
  .scene {
    min-height: 0;
    flex: 1;
  }
  .scene > svg {
    height: 100%;
  }
  .location {
    top: 8px;
    left: 8px;
    padding: 6px 10px;
    max-width: calc(100% - 16px);
  }
  .location strong {
    font-size: 16px;
  }
  .location small {
    display: none;
  }
  .worldbar {
    padding: 8px 10px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .worldbar > div:first-child {
    flex: 1 1 180px;
  }
  .worldbar p {
    font-size: 12px;
  }
  .actions {
    margin-left: auto;
  }
  .actions button {
    padding: 8px 10px;
  }
  .roster {
    padding: 4px 10px;
  }
  .tea-notice {
    bottom: 8px;
    font-size: 12px;
  }
}
.traffic {
  animation: traffic 15s linear infinite;
}
.traffic2 {
  animation: traffic 23s linear -12s infinite reverse;
}
@keyframes traffic {
  from {
    transform: translateX(-140px);
  }
  to {
    transform: translateX(1100px);
  }
}
.paused .traffic,
.paused .traffic2 {
  animation-play-state: paused;
}
@media (prefers-reduced-motion: reduce) {
  .traffic,
  .traffic2 {
    animation: none;
    transform: translateX(120px);
  }
  .traffic2 {
    transform: translateX(720px);
  }
}
</style>
