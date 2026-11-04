<script setup lang="ts">
import IncenseCourtyard from '~/components/IncenseCourtyard.vue'
import { createIncenseRepository } from '~/utils/incenseRepository'

defineProps<{ conversationId: string; actorId: string; roomTitle: string; profileFeedback?: string }>()
const emit = defineEmits<{ close: []; viewProfile: [userId: string] }>()
const repository = createIncenseRepository(useSupabaseClient())
</script>

<template>
  <IncenseCourtyard :conversation-id="conversationId" :actor-id="actorId" :room-title="roomTitle" :repository="repository" :profile-feedback="profileFeedback" @close="emit('close')" @view-profile="emit('viewProfile', $event)" />
</template>
