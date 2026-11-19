import { DemoPhrases } from "@/widgets/demo";
import { Faq } from "@/widgets/faq";
import { Features } from "@/widgets/features";
import { Footer } from "@/widgets/footer";
import { Header } from "@/widgets/header";
import { Hero } from "@/widgets/hero";
import { Install } from "@/widgets/install";
import { Screenshots } from "@/widgets/screenshots";
import { Donate, Support } from "@/widgets/support";
import { Downloads } from "@/widgets/downloads";
import { VoiceStatus } from "@/widgets/voice-status";
import { VoiceDemand } from "@/widgets/voice-demand";

import { FEATURES } from "@/shared/config";

export const App = () => (
  <>
    <Header />
    <main data-testid="main">
      <Hero />
      <Features />
      <DemoPhrases />
      <Support />
      <VoiceStatus />
      <VoiceDemand />
      <Install />
      {FEATURES.downloads ? <Downloads /> : null}
      <Donate />
      <Screenshots />
      <Faq />
    </main>
    <Footer />
  </>
);
