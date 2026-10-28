import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { motion, AnimatePresence } from 'motion/react'

type Cta = 'login' | 'signup'

const layoutIdFor = (c: Cta) => `auth-cta-${c}`

export default function LoginPage() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0()
  const navigate = useNavigate()

  // Which CTA (if any) is mid-expansion. While set, the clicked button morphs
  // to fill the whole page, then we hand off to Auth0.
  const [expanding, setExpanding] = useState<Cta | null>(null)

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/home', { replace: true })
  }, [isAuthenticated, isLoading, navigate])

  // Once the button has expanded to fill the screen, redirect. Sign-up passes
  // Auth0's screen_hint so it opens the registration view.
  useEffect(() => {
    if (!expanding) return
    const t = setTimeout(() => {
      if (expanding === 'signup') {
        loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })
      } else {
        loginWithRedirect()
      }
    }, 700)
    return () => clearTimeout(t)
  }, [expanding, loginWithRedirect])

  return (
    <div className="min-h-dvh app-bg flex flex-col items-center justify-center gap-12 p-6 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0.25, duration: 0.6 }}
        className="login-title text-5xl sm:text-7xl font-extrabold tracking-tight"
      >
        U-Course Advisor
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-md"
      >
        <motion.button
          layoutId={layoutIdFor('login')}
          type="button"
          disabled={!!expanding}
          onClick={() => setExpanding('login')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="login-primary w-full py-3.5 rounded-full text-base font-semibold text-white shadow-sm disabled:cursor-default"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          Log in
        </motion.button>

        <motion.button
          layoutId={layoutIdFor('signup')}
          type="button"
          disabled={!!expanding}
          onClick={() => setExpanding('signup')}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-3.5 rounded-full text-base font-semibold shadow-sm disabled:cursor-default"
          style={{ backgroundColor: '#fff', color: 'var(--brand)', border: '2px solid var(--brand)' }}
        >
          Sign up
        </motion.button>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-[11px] text-gray-500 max-w-xs leading-relaxed"
      >
        By continuing you agree to UNBC's academic data policy and our privacy terms.
      </motion.p>

      {/* Enter animation — the clicked button expands to fill the page (the same
          layoutId morph used across the app), then Auth0 takes over. */}
      <AnimatePresence>
        {expanding && (
          <motion.div
            key={expanding}
            layoutId={layoutIdFor(expanding)}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'var(--brand)', borderRadius: 0 }}
            transition={{ type: 'spring', bounce: 0.05, duration: 0.6 }}
          >
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="text-white text-lg font-semibold tracking-tight"
            >
              {expanding === 'signup' ? 'Setting things up…' : 'Signing you in…'}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
