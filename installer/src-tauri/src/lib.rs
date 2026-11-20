//! TSSR AI Voice Pack — инсталлятор (прототип, фаза 0).
//!
//! Что делает этот слой: только I/O, которое нельзя сделать в webview.
//!   • находит игру по Steam (реестр + `libraryfolders.vdf` + `appmanifest`);
//!   • качает `.7z` из GitHub Releases (докачка по Range, прогресс в UI);
//!   • распаковывает 7z СВОИМИ силами (`sevenz-rust`, без внешнего 7z.exe);
//!   • считает SHA-256 файла (для будущего `checksums.txt` релиза).
//!
//! Решения (что ставить, куда, что уже стоит) — на стороне TS (`src/core`),
//! чтобы их можно было тестировать без окна.
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

/// Steam App ID игры (единственный признак «официальной Steam-версии»).
const APP_ID: &str = "2166470";
/// Папка игры внутри `steamapps/common`.
const GAME_DIR_NAME: &str = "The Survival of Sarah Rose";
/// Наш мод внутри папки игры.
const MOD_DIR: &str = "mods/tssr-ai-voice-pack";

#[derive(Serialize, Clone)]
pub struct GameInfo {
    /// Корень игры (там, где `game/` и `TheSurvivalofSarahRose.exe`).
    pub path: String,
    /// Steam-библиотека, в которой нашлась игра (для диагностики).
    pub library: String,
    /// buildid из `appmanifest_2166470.acf` (версия игры в Steam).
    pub build_id: Option<String>,
    /// Наш мод уже стоит в этой папке.
    pub mod_installed: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

/// Steam отдаёт пути с прямыми слэшами и иногда в кавычках — нормализуем.
fn normalize(raw: &str) -> PathBuf {
    PathBuf::from(raw.trim().trim_matches('"').replace('/', "\\"))
}

/// Корни Steam из реестра (HKCU у пользователя, HKLM на случай machine-установки).
fn steam_roots() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut push = |p: String| {
        let path = normalize(&p);
        if path.is_dir() && !out.iter().any(|x| x == &path) {
            out.push(path);
        }
    };
    if let Ok(key) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
    {
        if let Ok(p) = key.get_value::<String, _>("SteamPath") {
            push(p);
        }
    }
    if let Ok(key) = winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam")
    {
        if let Ok(p) = key.get_value::<String, _>("InstallPath") {
            push(p);
        }
    }
    out
}

/// Библиотеки Steam из `steamapps/libraryfolders.vdf` (формат v2: `"path"  "D:\\..."`).
fn libraries(steam: &Path) -> Vec<PathBuf> {
    let vdf = steam.join("steamapps").join("libraryfolders.vdf");
    let Ok(text) = fs::read_to_string(&vdf) else {
        return vec![steam.to_path_buf()];
    };
    let mut out = vec![steam.to_path_buf()];
    for line in text.lines() {
        let line = line.trim();
        // Ключ «path» есть в v2; старый формат — `"1" "D:\\Games"`.
        let value = if let Some(rest) = line.strip_prefix("\"path\"") {
            rest.trim().trim_matches('"')
        } else if line.starts_with('"') && line.matches('"').count() == 4 {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 4 && parts[1].chars().all(|c| c.is_ascii_digit()) {
                parts[3]
            } else {
                continue;
            }
        } else {
            continue;
        };
        let path = normalize(value);
        if path.is_dir() && !out.iter().any(|x| x == &path) {
            out.push(path);
        }
    }
    out
}

/// buildid игры из appmanifest (для экрана «какая версия игры»).
fn build_id(steam: &Path) -> Option<String> {
    let acf = steam
        .join("steamapps")
        .join(format!("appmanifest_{APP_ID}.acf"));
    let text = fs::read_to_string(acf).ok()?;
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("\"buildid\"") {
            return Some(rest.trim().trim_matches('"').to_string());
        }
    }
    None
}

/// Язык Windows (UI/locale пользователя) — чтобы интерфейс стартовал на нём.
/// `navigator.language` в WebView2 бывает `en-US` даже на русской Windows
/// (проверено 2026-11-20), поэтому берём системное значение из реестра.
#[tauri::command]
fn system_locale() -> String {
    winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Control Panel\\International")
        .and_then(|k| k.get_value::<String, _>("LocaleName"))
        .unwrap_or_default()
}

/// Игра по Steam App ID: папка с `game/` внутри `steamapps/common/...`.
#[tauri::command]
fn find_game() -> Option<GameInfo> {
    for steam in steam_roots() {
        for lib in libraries(&steam) {
            let root = lib.join("steamapps").join("common").join(GAME_DIR_NAME);
            if root.join("game").is_dir() {
                return Some(GameInfo {
                    path: root.display().to_string(),
                    library: lib.display().to_string(),
                    build_id: build_id(&steam),
                    mod_installed: root.join(MOD_DIR).join("voice_config.rpy").is_file(),
                });
            }
        }
    }
    None
}

/// Папка, где лежит сам exe — туда качаем архивы (решение владельца: рядом с инсталлятором).
#[tauri::command]
fn app_dir() -> String {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.display().to_string()))
        .unwrap_or_default()
}

/// SHA-256 файла (нижний hex) — сверка с будущим `checksums.txt` релиза.
#[tauri::command]
fn sha256_file(path: String) -> Result<String, String> {
    let mut file = fs::File::open(&path).map_err(|e| format!("{path}: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Скачать файл с докачкой (Range); прогресс отдаёт колбэк.
async fn download_impl<F: Fn(u64, Option<u64>)>(url: &str, dest: &str, on_progress: F) -> Result<u64, String> {
    let path = PathBuf::from(dest);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("{dest}: {e}"))?;
    }
    let mut have = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    let client = reqwest::Client::builder()
        .user_agent("tssr-installer/0.1")
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(url);
    if have > 0 {
        req = req.header("Range", format!("bytes={have}-"));
    }
    let resp = req.send().await.map_err(|e| format!("{url}: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("HTTP {status} для {url}"));
    }
    // Сервер не умеет Range — начинаем заново, иначе приклеим кусок не туда.
    if have > 0 && status != reqwest::StatusCode::PARTIAL_CONTENT {
        have = 0;
    }
    let total = resp.content_length().map(|len| len + have);
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(have > 0)
        .truncate(have == 0)
        .open(&path)
        .map_err(|e| format!("{dest}: {e}"))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded = have;
    let started = Instant::now();
    let mut last_emit = Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if last_emit.elapsed() > Duration::from_millis(120) {
            on_progress(downloaded, total);
            last_emit = Instant::now();
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    on_progress(downloaded, total.or(Some(downloaded)));
    let secs = started.elapsed().as_secs_f64().max(0.001);
    println!(
        "download: {downloaded} байт за {:.1} с ({:.1} МБ/с) -> {dest}",
        secs,
        (downloaded as f64 / 1_048_576.0) / secs
    );
    Ok(downloaded)
}

/// Распаковать архивы в папку; возвращает число файлов (раскладка = установка).
async fn extract_impl(archive: &str, dest: &str) -> Result<u32, String> {
    let dest_path = PathBuf::from(dest);
    fs::create_dir_all(&dest_path).map_err(|e| format!("{dest}: {e}"))?;
    sevenz_rust::decompress_file(archive, &dest_path).map_err(|e| format!("{archive}: {e}"))?;
    Ok(count_files(&dest_path))
}

/// Сколько файлов лежит под папкой (рекурсивно) — для лога установки.
fn count_files(root: &Path) -> u32 {
    let mut count = 0u32;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else {
                count += 1;
            }
        }
    }
    count
}

/// Команда UI: скачать с прогрессом (событие `download-progress`).
#[tauri::command]
async fn download(app: AppHandle, url: String, dest: String) -> Result<u64, String> {
    download_impl(&url, &dest, |downloaded, total| {
        let _ = app.emit("download-progress", Progress { downloaded, total });
    })
    .await
}

/// Команда UI: распаковать в папку игры.
#[tauri::command]
async fn extract(archive: String, dest: String) -> Result<u32, String> {
    extract_impl(&archive, &dest).await
}

/// Проверка пайплайна без окна (E2E прототипа): находит игру, ставит core и
/// один язык в тестовую папку, проверяет инвентарь, удаляет язык и мод.
pub fn selftest(out: &str) -> i32 {
    const TAG: &str = "v2026.11.19-2237";
    const BASE: &str = "https://github.com/Domovikx/The-Survival-of-Sarah-Rose-Mods/releases/download";
    let out_dir = PathBuf::from(out);
    if let Err(e) = fs::create_dir_all(&out_dir) {
        eprintln!("selftest: папка {out}: {e}");
        return 1;
    }
    match find_game() {
        Some(g) => println!("selftest: game = {}", g.path),
        None => {
            eprintln!("selftest: игра не найдена (нужна Steam-версия)");
            return 1;
        }
    }
    let root = out_dir.join("game");
    let root_s = root.display().to_string();
    if let Err(e) = fs::create_dir_all(&root) {
        eprintln!("selftest: {root_s}: {e}");
        return 1;
    }

    // 1) core + 2) язык EN — как это делает UI по галочкам.
    for (asset, url) in [
        (
            "TSSR-AI-Voice-Pack-main.7z",
            format!("{BASE}/{TAG}/TSSR-AI-Voice-Pack-main.7z"),
        ),
        (
            "TSSR-AI-Voice-Pack-voice-en.7z",
            format!("{BASE}/{TAG}/TSSR-AI-Voice-Pack-voice-en.7z"),
        ),
    ] {
        let dest = out_dir.join(asset).display().to_string();
        println!("selftest: download {asset}");
        match tauri::async_runtime::block_on(download_impl(&url, &dest, |_, _| {})) {
            Ok(bytes) => println!("  {bytes} bytes"),
            Err(e) => {
                eprintln!("selftest: download {asset} failed: {e}");
                return 1;
            }
        }
        match tauri::async_runtime::block_on(extract_impl(&dest, &root_s)) {
            Ok(files) => println!("  extracted {files} files"),
            Err(e) => {
                eprintln!("selftest: extract {asset} failed: {e}");
                return 1;
            }
        }
    }

    // 3) инвентарь: ядро + EN с файлами.
    let st = scan_install(root_s.clone());
    println!(
        "selftest: scan core={} langs={:?} env={} other={:?}",
        st.core,
        st.langs.iter().map(|l| (l.lang.clone(), l.files)).collect::<Vec<_>>(),
        st.environment,
        st.other_mods
    );
    let en_files = st.langs.iter().find(|l| l.lang == "en").map(|l| l.files).unwrap_or(0);
    if !st.core || en_files == 0 {
        eprintln!("selftest: FATAL: после установки нет core или EN");
        return 1;
    }

    // 4) удаление одного языка.
    match remove_lang(root_s.clone(), "en".to_string()) {
        Ok(files) => println!("selftest: removed en ({files} files)"),
        Err(e) => {
            eprintln!("selftest: remove_lang failed: {e}");
            return 1;
        }
    }
    let after = scan_install(root_s.clone());
    if after.langs.iter().any(|l| l.lang == "en") || !after.core {
        eprintln!("selftest: FATAL: после удаления EN состояние неверное");
        return 1;
    }

    // 5) полный uninstall (в temp: других модов нет → environment.txt уходит).
    match uninstall(root_s.clone()) {
        Ok(r) => println!(
            "selftest: uninstall mod={} env_removed={} env_kept={}",
            r.removed_mod, r.removed_environment, r.kept_environment
        ),
        Err(e) => {
            eprintln!("selftest: uninstall failed: {e}");
            return 1;
        }
    }
    if mod_dir(&root).exists() {
        eprintln!("selftest: FATAL: папка мода осталась после uninstall");
        return 1;
    }
    println!("selftest: OK — install(core+lang) / remove_lang / uninstall");
    0
}

/// Состояние установки в папке игры: что уже стоит.
#[derive(Serialize, Clone)]
pub struct LangState {
    pub lang: String,
    /// Сколько файлов озвучки лежит в `ai_voice/<lang>/`.
    pub files: u32,
}

#[derive(Serialize, Clone)]
pub struct InstallState {
    pub core: bool,
    pub langs: Vec<LangState>,
    pub environment: bool,
    /// Другие моды в `mods/` (их не трогаем никогда).
    pub other_mods: Vec<String>,
}

/// Что именно удалили при uninstall (для честного лога в UI).
#[derive(Serialize, Clone)]
pub struct UninstallReport {
    pub removed_mod: bool,
    pub removed_environment: bool,
    pub kept_environment: bool,
    pub other_mods: Vec<String>,
}

fn mod_dir(game: &Path) -> PathBuf {
    game.join(MOD_DIR)
}

/// Другие моды в `mods/` (всё, кроме нашего каталога).
fn other_mods(game: &Path) -> Vec<String> {
    let mods = game.join("mods");
    let Ok(entries) = fs::read_dir(&mods) else {
        return Vec::new();
    };
    let mut out: Vec<String> = entries
        .flatten()
        .filter(|e| e.file_name() != "tssr-ai-voice-pack")
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    out.sort();
    out
}

/// Инвентарь установки: ядро, языки (с числом файлов), environment.txt, чужие моды.
#[tauri::command]
fn scan_install(game: String) -> InstallState {
    let root = PathBuf::from(&game);
    let md = mod_dir(&root);
    let ai_voice = md.join("ai_voice");
    let mut langs: Vec<LangState> = Vec::new();
    if let Ok(entries) = fs::read_dir(&ai_voice) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() {
                continue;
            }
            let lang = entry.file_name().to_string_lossy().to_string();
            let files = count_voice_files(&entry.path());
            langs.push(LangState { lang, files });
        }
    }
    langs.sort_by(|a, b| a.lang.cmp(&b.lang));
    InstallState {
        core: md.join("voice_config.rpy").is_file(),
        langs,
        environment: root.join("environment.txt").is_file(),
        other_mods: other_mods(&root),
    }
}

/// Имя файла корпуса по контракту `{en12}-{state6} {variant}.opus`.
///
/// Считаем ТОЛЬКО такие файлы: движок игры ищет ровно их, а любой другой
/// `.opus`/`.wav` (бенч-имена, огрызки) — не озвучка. Проверено на инциденте
/// 2026-11-20: 1 851 файл с именами стенда выглядел как «прогресс», но игра
/// их не находила.
fn is_contract_name(stem: &str) -> bool {
    const B32: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bytes: Vec<char> = stem.chars().collect();
    if bytes.len() < 21 {
        return false;
    }
    let is_b32 = |c: char| B32.contains(c);
    bytes[..12].iter().all(|c| is_b32(*c))
        && bytes[12] == '-'
        && bytes[13..19].iter().all(|c| is_b32(*c))
        && bytes[19] == ' '
        && bytes[20..].iter().any(|c| !c.is_whitespace())
}

/// Атомарный счёт озвучки языка: ОДНА реплика = ОДИН стем (`{...}.opus`),
/// независимо от того, лежит рядом wav (легаси) или нет. Считаем только имена
/// по контракту — «файлов вообще» недостаточно.
fn count_voice_files(dir: &Path) -> u32 {
    let mut stems: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = fs::read_dir(&d) else {
            continue;
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let Some(ext) = p.extension().and_then(|x| x.to_str()) else {
                continue;
            };
            if ext != "opus" && ext != "wav" {
                continue;
            }
            let Some(stem) = p.file_stem().and_then(|x| x.to_str()) else {
                continue;
            };
            if is_contract_name(stem) {
                stems.insert(stem.to_string());
            }
        }
    }
    stems.len() as u32
}

/// Удалить озвучку одного языка (только `ai_voice/<lang>/` внутри нашего мода).
#[tauri::command]
fn remove_lang(game: String, lang: String) -> Result<u32, String> {
    if lang.is_empty() || lang.contains(['/', '\\', '.']) {
        return Err(format!("некорректный код языка: {lang}"));
    }
    let dir = mod_dir(&PathBuf::from(&game)).join("ai_voice").join(&lang);
    if !dir.is_dir() {
        return Ok(0);
    }
    let files = count_voice_files(&dir);
    fs::remove_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(files)
}

/// Удалить мод целиком. `environment.txt` — только если других модов нет
/// (иначе снесём searchpath чужим модам — правило из AGENTS).
#[tauri::command]
fn uninstall(game: String) -> Result<UninstallReport, String> {
    let root = PathBuf::from(&game);
    let md = mod_dir(&root);
    let removed_mod = if md.is_dir() {
        fs::remove_dir_all(&md).map_err(|e| format!("{}: {e}", md.display()))?;
        true
    } else {
        false
    };
    let others = other_mods(&root);
    let env = root.join("environment.txt");
    let mut removed_environment = false;
    if others.is_empty() && env.is_file() {
        fs::remove_file(&env).map_err(|e| format!("{}: {e}", env.display()))?;
        removed_environment = true;
    }
    Ok(UninstallReport {
        removed_mod,
        removed_environment,
        kept_environment: !removed_environment && env.is_file(),
        other_mods: others,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            find_game,
            system_locale,
            app_dir,
            sha256_file,
            download,
            extract,
            scan_install,
            remove_lang,
            uninstall
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
