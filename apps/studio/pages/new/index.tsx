import HCaptcha from '@hcaptcha/react-hcaptcha'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useTheme } from 'next-themes'
import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useState } from 'react'

import { NewOrgForm } from 'components/interfaces/Organization'
import { WizardLayout } from 'components/layouts'
import { useSetupIntent } from 'data/stripe/setup-intent-mutation'
import { STRIPE_PUBLIC_KEY } from 'lib/constants'
import type { NextPageWithLayout } from 'types'

const stripePromise = loadStripe(STRIPE_PUBLIC_KEY)

/**
 * No org selected yet, create a new one
 */
const Wizard: NextPageWithLayout = () => {
  const { resolvedTheme } = useTheme()

  const [intent, setIntent] = useState<any>()
  const [captchaLoaded, setHCaptchaLoaded] = useState(false)

  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRef, setCaptchaRef] = useState<HCaptcha | null>(null)

  const { mutate: setupIntent } = useSetupIntent({ onSuccess: (res) => setIntent(res) })

  const captchaRefCallback = useCallback((node: any) => {
    setCaptchaRef(node)
  }, [])

  const initSetupIntent = async (hcaptchaToken: string | undefined) => {
    if (!hcaptchaToken) return console.error('Hcaptcha token is required')

    // Force a reload of Elements, necessary for Stripe
    setIntent(undefined)
    setupIntent({ hcaptchaToken })
  }

  const options = {
    clientSecret: intent ? intent.client_secret : '',
    appearance: { theme: resolvedTheme?.includes('dark') ? 'night' : 'flat', labels: 'floating' },
  } as any

  const loadPaymentForm = async () => {
    if (captchaRef && captchaLoaded) {
      let token = captchaToken

      try {
        if (!token) {
          const captchaResponse = await captchaRef.execute({ async: true })
          token = captchaResponse?.response ?? null
        }
      } catch (error) {
        return
      }

      await initSetupIntent(token ?? undefined)
      resetCaptcha()
    }
  }

  useEffect(() => {
    loadPaymentForm()
  }, [captchaRef, captchaLoaded])

  const resetSetupIntent = () => {
    return loadPaymentForm()
  }

  const onLocalCancel = () => {
    setIntent(undefined)
  }

  const resetCaptcha = () => {
    setCaptchaToken(null)
    captchaRef?.resetCaptcha()
  }

  return (
    <>
      <HCaptcha
        ref={captchaRefCallback}
        sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY!}
        size="invisible"
        onOpen={() => {
          // [Joshen] This is to ensure that hCaptcha popup remains clickable
          if (document !== undefined) document.body.classList.add('!pointer-events-auto')
        }}
        onClose={() => {
          onLocalCancel()
          if (document !== undefined) document.body.classList.remove('!pointer-events-auto')
        }}
        onVerify={(token) => {
          setCaptchaToken(token)
          if (document !== undefined) document.body.classList.remove('!pointer-events-auto')
        }}
        onLoad={() => setHCaptchaLoaded(true)}
      />

      {intent && (
        <Elements stripe={stripePromise} options={options}>
          <NewOrgForm onPaymentMethodReset={() => resetSetupIntent()} />
        </Elements>
      )}
    </>
  )
}

Wizard.getLayout = (page) => (
  <WizardLayout organization={null} project={null}>
    {page}
  </WizardLayout>
)

export default observer(Wizard)
