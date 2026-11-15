import { DemoPhrases } from "@/widgets/demo";
import { Faq } from "@/widgets/faq";
import { Features } from "@/widgets/features";
import { Footer } from "@/widgets/footer";
import { Header } from "@/widgets/header";
import { Hero } from "@/widgets/hero";
import { Install } from "@/widgets/install";
import { Screenshots } from "@/widgets/screenshots";
import { Support } from "@/widgets/support";
import { Downloads } from "@/widgets/downloads";
import { VoiceStatus } from "@/widgets/voice-status";

import { FEATURES } from "@/shared/config";

export const App = () => (
  <>
    <Header />
    <main data-testid="main">
      <Hero />
      <Features />
      <DemoPhrases />
      <VoiceStatus />
      <Install />
      {FEATURES.downloads ? <Downloads /> : null}
      <Screenshots />
      <Support />
      <Faq />
    </main>
    <Footer />
  </>
);
