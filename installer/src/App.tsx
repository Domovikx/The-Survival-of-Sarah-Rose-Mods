import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { ActionBar } from "@/components/ActionBar";
import { ComponentsPanel } from "@/components/ComponentsPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Footer } from "@/components/Footer";
import { GameCard } from "@/components/GameCard";
import { Header } from "@/components/Header";
import { LogPanel } from "@/components/LogPanel";
import { VOICE_LANGS, voiceAsset } from "@/core/pack";
import { useInstaller } from "@/hooks/useInstaller";
import { getLang, initLang, setLang, type UiLang } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./App.styles";

export const App = () => {
  const [lang, setLangState] = useState<UiLang>(getLang());
  const inst = useInstaller();

  // Язык интерфейса: системный (Rust) → localStorage → переключатель.
  useEffect(() => {
    void (async () => {
      const system = await invoke<string>("system_locale").catch(() => "");
      setLangState(initLang(system));
      await inst.detect();
    })();
    // Один раз при старте: detect внутри меняет состояние, но подписка не нужна.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeLang = useCallback((next: UiLang) => {
    setLang(next);
    setLangState(next);
  }, []);

  const sizeOf = useCallback((langCode: string) => inst.assetSize(voiceAsset(langCode)), [inst]);

  return (
    <div className={cx(styles.app)} data-testid="App">
      <Header lang={lang} onChange={changeLang} />

      <main className={cx(styles.main)} data-testid="App--main">
        <GameCard game={inst.game} detected={inst.detected} busy={inst.busy} onRedetect={() => void inst.detect()} />
        <ComponentsPanel
          state={inst.state}
          langs={VOICE_LANGS}
          desired={inst.desired}
          sizeOf={sizeOf}
          busy={inst.busy}
          active={inst.active}
          onToggle={inst.toggleLang}
        />
        <LogPanel lines={inst.lines} />
      </main>

      <Footer />

      <ActionBar
        status={inst.status}
        progress={inst.progress}
        active={inst.active}
        busy={inst.busy}
        changes={inst.changes}
        coreOnly={inst.changes > 0 && !inst.state?.core && !inst.diff.install.length && !inst.diff.remove.length}
        canUninstall={Boolean(inst.state?.core || inst.state?.langs.length)}
        onApply={inst.apply}
        onUninstall={inst.uninstall}
      />

      {inst.confirm ? <ConfirmDialog request={inst.confirm} onClose={inst.closeConfirm} /> : null}
    </div>
  );
};
