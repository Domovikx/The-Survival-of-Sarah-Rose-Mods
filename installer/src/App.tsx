import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { ActionBar } from "@/components/ActionBar";
import { ComponentsPanel } from "@/components/ComponentsPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GameCard } from "@/components/GameCard";
import { Header } from "@/components/Header";
import { LogPanel } from "@/components/LogPanel";
import { LINKS, VOICE_LANGS, voiceAsset } from "@/core/pack";
import { useInstaller } from "@/hooks/useInstaller";
import { getLang, initLang, LANG_LABELS, setLang, t, UI_LANGS, type UiLang } from "@/i18n";
import { cx } from "@/ui/cx";

import { styles } from "./App.styles";

const LANGS = UI_LANGS.map((code) => ({ code, label: LANG_LABELS[code] }));

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
    <div className={cx(styles.app)}>
      <Header lang={lang} langs={LANGS} onChange={changeLang} />

      <main className={cx(styles.main)}>
        <GameCard game={inst.game} detected={inst.detected} busy={inst.busy} onRedetect={() => void inst.detect()} />
        <ComponentsPanel
          state={inst.state}
          langs={VOICE_LANGS}
          desired={inst.desired}
          sizeOf={sizeOf}
          busy={inst.busy}
          onToggle={inst.toggleLang}
        />
        <LogPanel lines={inst.lines} />

        <div className={cx(styles.footer)}>
          <span>{t("Like the patch?")}</span>
          <button type="button" className={cx(styles.link)} onClick={() => void openUrl(LINKS.github)}>
            {t("Star on GitHub")}
          </button>
          <span className={cx(styles.dot)}>·</span>
          <button type="button" className={cx(styles.link)} onClick={() => void openUrl(LINKS.steamGuide)}>
            {t("Steam guide")}
          </button>
          <span className={cx(styles.dot)}>·</span>
          <button type="button" className={cx(styles.link)} onClick={() => void openUrl(LINKS.issues)}>
            {t("Report an issue")}
          </button>
          <span className={cx(styles.pushRight)}>v0.1.0</span>
        </div>
      </main>

      <ActionBar
        status={inst.status}
        progress={inst.progress}
        busy={inst.busy}
        changes={inst.changes}
        canUninstall={Boolean(inst.state?.core || inst.state?.langs.length)}
        onApply={inst.apply}
        onUninstall={inst.uninstall}
      />

      {inst.confirm ? <ConfirmDialog request={inst.confirm} onClose={inst.closeConfirm} /> : null}
    </div>
  );
};
