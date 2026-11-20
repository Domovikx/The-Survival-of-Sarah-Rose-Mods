// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Невидимый E2E: `installer.exe --selftest <папка>` — без окна проверяет
    // поиск игры, скачивание и распаковку (прототип, фаза 0).
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--selftest") {
        let out = args.get(i + 1).cloned().unwrap_or_else(|| "tmp/selftest".to_string());
        std::process::exit(installer_lib::selftest(&out));
    }
    installer_lib::run()
}
