import { DemoPhrases } from '@/widgets/demo'
import { Faq } from '@/widgets/faq'
import { Features } from '@/widgets/features'
import { Footer } from '@/widgets/footer'
import { Header } from '@/widgets/header'
import { Hero } from '@/widgets/hero'
import { Install } from '@/widgets/install'
import { Screenshots } from '@/widgets/screenshots'
import { VoiceStatus } from '@/widgets/voice-status'

export const App = () => (
  <>
    <Header />
    <main data-testid="main">
      <Hero />
      <Features />
      <DemoPhrases />
      <VoiceStatus />
      <Install />
      <Screenshots />
      <Faq />
    </main>
    <Footer />
  </>
)
