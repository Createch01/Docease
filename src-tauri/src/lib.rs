use std::fs;
use std::path::PathBuf;
use log;
use serde_json::Value;
use tauri::Manager;

#[tauri::command]
fn scan_json_files(app: tauri::AppHandle) -> Vec<(String, String)> {
    let mut results = Vec::new();
    let data_dir = app.path().app_local_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    
    if let Ok(entries) = fs::read_dir(data_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    let lower_name = filename.to_lowercase();
                    if lower_name.contains("package") || 
                       lower_name.contains("tsconfig") || 
                       lower_name.contains("tauri.conf") ||
                       lower_name.contains("metadata.json") ||
                       lower_name.contains("latest.json") {
                        continue;
                    }

                    if let Ok(content) = fs::read_to_string(&path) {
                        results.push((filename.to_string(), content));
                    }
                }
            }
        }
    }
    results
}

#[tauri::command]
fn save_json(app: tauri::AppHandle, filename: String, data: Value) -> Result<(), String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    
    // Ensure the app data directory exists
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    
    path.push(&filename);
    
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let json_str = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(path, json_str).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_json(app: tauri::AppHandle, filename: String) -> Result<Value, String> {
    let mut path = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    path.push(&filename);
    
    if !path.exists() {
        return Err("File not found".to_string());
    }
    
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(data)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        scan_json_files,
        save_json,
        load_json
    ])
    .setup(|app| {
      // Ensure data directory exists on startup
      let data_dir = app.path().app_local_data_dir()?;
      if !data_dir.exists() {
          fs::create_dir_all(data_dir)?;
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_fs::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
