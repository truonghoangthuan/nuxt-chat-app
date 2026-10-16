export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

  const isPublicRoute = to.path === '/login' || to.path === '/confirm'

  if (!user.value && !isPublicRoute) {
    return navigateTo('/login')
  }

  if (user.value && to.path === '/login') {
    return navigateTo('/')
  }
})
