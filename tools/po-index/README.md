# po-index (Rust)

Строит индекс `po/template.pot` + `po/*.po` за один проход: счётчики перевода,
категории, отпечаток uid. TS-команды (`stats`, дальше `voice_status`) читают
готовый JSON вместо повторного парсинга 141 МБ PO на каждом запуске.

```bash
cargo build --release --manifest-path tools/po-index/Cargo.toml
./tools/po-index/target/release/po-index \
  --pot patches/ai-voice-pack/po/template.pot \
  --po-dir patches/ai-voice-pack/po \
  --out tmp/po-index.json
```

Индекс содержит штампы (mtime+size) POT и каждого PO: если файл изменился,
TS не доверяет индексу и пересчитывает сам (оракул — TS-парсер, Rust — ускоритель).

Замер (2026-11-22, тот же корпус): POT + все 10 `po/*.po` — TS 7 406 мс,
Rust 2 649 мс (−64 %), паритет по отпечатку uid и счётчикам.
