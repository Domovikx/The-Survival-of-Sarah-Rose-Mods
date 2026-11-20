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
import { VoiceDemand } from "@/widgets/voice-demand";
import { VoiceProgress } from "@/widgets/voice-progress";

import { useEffect } from "react";

import { FEATURES } from "@/shared/config";

/**
 * Переход по якорю при загрузке страницы: SPA рендерится ПОСЛЕ того, как
 * браузер попытался прыгнуть к `#download`, поэтому скроллим сами (один раз,
 * после первой отрисовки). Со стики-шапкой помогает `scroll-margin-top` секций.
 */
const useHashScroll = (): void => {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
    });
  }, []);
};

export const App = () => {
  useHashScroll();

  return (
    <>
      <Header />
      <main data-testid="main">
        <Hero />
        <Features />
        <DemoPhrases />
        <Support />
        {FEATURES.progress ? <VoiceProgress /> : null}
        <VoiceDemand />
        <Install />
        {FEATURES.downloads ? <Downloads /> : null}
        {FEATURES.donate ? <Donate /> : null}
        <Screenshots />
        <Faq />
      </main>
      <Footer />
    </>
  );
};
