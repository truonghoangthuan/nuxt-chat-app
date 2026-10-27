import { defineEventHandler, readBody, createError } from 'h3'
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { submitChessMove } from '../../utils/chessMove'

export default defineEventHandler(async event => {
  // Reject cross-origin browser submissions; cookies authenticate same-origin calls.
  const origin = event.headers.get('origin')
  if (origin && origin !== new URL(event.node.req.url || '/', `https://${event.headers.get('host')}`).origin
    && origin !== `http://${event.headers.get('host')}`) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid request origin.' })
  }
  let user
  try { user = await serverSupabaseUser(event) }
  catch { throw createError({ statusCode: 401, statusMessage: 'Sign in to play.' }) }
  const actor = typeof user?.sub === 'string' ? user.sub : typeof user?.id === 'string' ? user.id : ''
  if (!actor) throw createError({ statusCode: 401, statusMessage: 'Sign in to play.' })
  let client
  try { client = serverSupabaseServiceRole(event) }
  catch { throw createError({ statusCode: 503, statusMessage: 'Chess server is not configured.' }) }
  return submitChessMove(client, actor, await readBody(event))
})
