//! po-index — индекс POT/PO для пайплайна TSSR.
//!
//! Зачем: `stats` и `voice_status` на каждом запуске парсят `template.pot` и
//! до 10 файлов `po/*.po` (≈141 МБ) ради счётчиков и каталога. Rust делает ту же
//! работу за один проход и кладёт результат в JSON (2.8× быстрее на замере
//! 2026-11-22), а TS остаётся источником логики и оракулом: если штампы файлов
//! не совпадают, TS не доверяет индексу и считает сам.
//!
//! Формат индекса:
//! ```json
//! { "pot": { "entries": 69120, "uid": "…", "categories": {…}, "stamp": {"mtime":…,"size":…} },
//!   "po":  { "ru": { "entries": 69120, "filled": 69120, "stamp": {…} }, … } }
//! ```
use md5::{Digest, Md5};
use regex::Regex;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Default, Clone)]
struct Entry {
    msgid: String,
    msgctxt: String,
    msgstr: String,
    refs_len: usize,
}

fn unescape(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'\\' && i + 1 < bytes.len() {
            let n = bytes[i + 1] as char;
            out.push(match n {
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                other => other,
            });
            i += 2;
        } else {
            let len = utf8_len(c);
            let end = (i + len).min(bytes.len());
            out.push_str(std::str::from_utf8(&bytes[i..end]).unwrap_or(""));
            i = end;
        }
    }
    out
}

fn utf8_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b >> 5 == 0b110 {
        2
    } else if b >> 4 == 0b1110 {
        3
    } else {
        4
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Field {
    Msgid,
    Msgctxt,
    Msgstr,
}

/// Разбор PO/POT. Повторяет правила `po_core.mts`: пустая строка закрывает
/// запись, `#:` / `#,` / `#.` / `#` — служебные строки, продолжения — `"…"`.
fn parse_po(text: &str) -> Vec<Entry> {
    let re_msg = Regex::new(r#"^(msgid|msgctxt|msgstr)\s+"(.*)"$"#).unwrap();
    let re_cont = Regex::new(r#"^"(.*)"$"#).unwrap();
    let re_ref = Regex::new(r"^#: +(.+)$").unwrap();

    let mut entries: Vec<Entry> = Vec::new();
    let mut cur: Option<Entry> = None;
    let mut field: Option<Field> = None;

    let flush = |cur: &mut Option<Entry>, entries: &mut Vec<Entry>| {
        if let Some(e) = cur.take() {
            if !e.msgid.is_empty() || !e.msgstr.is_empty() || !e.msgctxt.is_empty() || e.refs_len > 0 {
                entries.push(e);
            }
        }
    };

    for raw in text.split('\n') {
        let line = raw.trim();
        if line.is_empty() {
            flush(&mut cur, &mut entries);
            field = None;
            continue;
        }
        if let Some(c) = re_msg.captures(line) {
            let e = cur.get_or_insert_with(Entry::default);
            let value = unescape(&c[2]);
            match &c[1] {
                "msgid" => {
                    e.msgid = value;
                    field = Some(Field::Msgid);
                }
                "msgctxt" => {
                    e.msgctxt = value;
                    field = Some(Field::Msgctxt);
                }
                _ => {
                    e.msgstr = value;
                    field = Some(Field::Msgstr);
                }
            }
            continue;
        }
        if let Some(c) = re_cont.captures(line) {
            if let (Some(e), Some(f)) = (cur.as_mut(), field) {
                let value = unescape(&c[1]);
                match f {
                    Field::Msgid => e.msgid.push_str(&value),
                    Field::Msgctxt => e.msgctxt.push_str(&value),
                    Field::Msgstr => e.msgstr.push_str(&value),
                }
                continue;
            }
            field = None;
            continue;
        }
        if re_ref.is_match(line) {
            cur.get_or_insert_with(Entry::default).refs_len += 1;
        }
        field = None;
    }
    flush(&mut cur, &mut entries);
    entries
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// mtime (секунды) + размер — достаточно, чтобы поймать любую правку файла.
fn stamp(path: &Path) -> (u64, u64) {
    let md = fs::metadata(path).expect("metadata");
    let mtime = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (mtime, md.len())
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let arg = |name: &str| -> Option<String> {
        args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
    };

    let pot_path = arg("--pot").expect("нужен --pot <template.pot>");
    let po_dir = arg("--po-dir").expect("нужен --po-dir <папка с po>");
    let out_path = arg("--out");

    let pot_text = fs::read_to_string(&pot_path).expect("читать POT");
    let pot = parse_po(&pot_text);

    let mut categories = [0usize; 4]; // dialogue, narration, menu, ui
    let mut uid_hash = Md5::new();
    let mut pot_entries = 0usize;
    for e in &pot {
        if e.msgid.is_empty() {
            continue;
        }
        pot_entries += 1;
        let cat = if let Some(rest) = e.msgctxt.strip_prefix("speaker:") {
            if rest == "Narrator" {
                1
            } else {
                0
            }
        } else if e.msgctxt == "menu" {
            2
        } else {
            3
        };
        categories[cat] += 1;
        uid_hash.update(Md5::digest(e.msgid.as_bytes()));
    }

    let (pot_mtime, pot_size) = stamp(Path::new(&pot_path));
    let mut json = String::new();
    json.push_str(&format!(
        "{{\n  \"pot\": {{\"entries\": {pot_entries}, \"uid\": \"{}\", \"categories\": {{\"dialogue\": {}, \"narration\": {}, \"menu\": {}, \"ui\": {}}}, \"stamp\": {{\"mtime\": {pot_mtime}, \"size\": {pot_size}}}}},\n  \"po\": {{",
        hex(&uid_hash.finalize()),
        categories[0],
        categories[1],
        categories[2],
        categories[3]
    ));

    let mut first = true;
    let mut langs: Vec<PathBuf> = fs::read_dir(&po_dir)
        .expect("читать папку po")
        .filter_map(|e| e.ok().map(|x| x.path()))
        .filter(|p| p.extension().map(|e| e == "po").unwrap_or(false))
        .collect();
    langs.sort();
    for path in langs {
        let lang = path.file_stem().unwrap().to_string_lossy().to_string();
        let text = fs::read_to_string(&path).expect("читать PO");
        let entries = parse_po(&text);
        let total = entries.iter().filter(|e| !e.msgid.is_empty()).count();
        let filled = entries
            .iter()
            .filter(|e| !e.msgid.is_empty() && !e.msgstr.trim().is_empty())
            .count();
        let (mtime, size) = stamp(&path);
        if !first {
            json.push(',');
        }
        json.push_str(&format!(
            "\n    \"{}\": {{\"entries\": {total}, \"filled\": {filled}, \"stamp\": {{\"mtime\": {mtime}, \"size\": {size}}}}}",
            json_escape(&lang)
        ));
        first = false;
    }
    json.push_str("\n  }\n}\n");

    match out_path {
        Some(path) => {
            if let Some(dir) = Path::new(&path).parent() {
                let _ = fs::create_dir_all(dir);
            }
            let mut f = fs::File::create(&path).expect("создать выходной файл");
            f.write_all(json.as_bytes()).expect("записать индекс");
            println!("po-index: {path}");
        }
        None => print!("{json}"),
    }
}
