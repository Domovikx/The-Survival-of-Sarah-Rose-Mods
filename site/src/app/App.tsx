import { DemoPhrases } from '@/widgets/demo'
import { Faq } from '@/widgets/faq'
import { Features } from '@/widgets/features'
import { Footer } from '@/widgets/footer'
import { Header } from '@/widgets/header'
import { Hero } from '@/widgets/hero'
import { Install } from '@/widgets/install'
import { Screenshots } from '@/widgets/screenshots'
import { TempDownloads } from '@/widgets/temp-downloads'
import { VoiceStatus } from '@/widgets/voice-status'

import { FEATURES } from '@/shared/config/flags'

export const App = () => (
  <>
    <Header />
    <main data-testid="main">
      <Hero />
      <Features />
      <DemoPhrases />
      <VoiceStatus />
      <Install />
      {FEATURES.tempDownloads ? <TempDownloads /> : null}
      <Screenshots />
      <Faq />
    </main>
    <Footer />
  </>
)
