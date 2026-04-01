#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::thread;
use tauri::Manager;

// Embed all UI files at compile time
const FILES: &[(&str, &str, &str)] = &[
    ("/", include_str!("../../ui/index.html"), "text/html; charset=utf-8"),
    ("/index.html", include_str!("../../ui/index.html"), "text/html; charset=utf-8"),
    ("/styles.css", include_str!("../../ui/styles.css"), "text/css; charset=utf-8"),
    ("/app.js", include_str!("../../ui/app.js"), "text/javascript; charset=utf-8"),
    ("/config.js", include_str!("../../ui/config.js"), "text/javascript; charset=utf-8"),
    ("/config.example.js", include_str!("../../ui/config.example.js"), "text/javascript; charset=utf-8"),
    // Core modules
    ("/core/utils.js", include_str!("../../ui/core/utils.js"), "text/javascript; charset=utf-8"),
    ("/core/player.js", include_str!("../../ui/core/player.js"), "text/javascript; charset=utf-8"),
    ("/core/search.js", include_str!("../../ui/core/search.js"), "text/javascript; charset=utf-8"),
    ("/core/tracklist.js", include_str!("../../ui/core/tracklist.js"), "text/javascript; charset=utf-8"),
    ("/core/images.js", include_str!("../../ui/core/images.js"), "text/javascript; charset=utf-8"),
    ("/core/facts.js", include_str!("../../ui/core/facts.js"), "text/javascript; charset=utf-8"),
    ("/core/controls.js", include_str!("../../ui/core/controls.js"), "text/javascript; charset=utf-8"),
    ("/core/viz-manager.js", include_str!("../../ui/core/viz-manager.js"), "text/javascript; charset=utf-8"),
    // Plugins
    ("/plugins/plugin-loader.js", include_str!("../../ui/plugins/plugin-loader.js"), "text/javascript; charset=utf-8"),
    ("/plugins/ambient/index.js", include_str!("../../ui/plugins/ambient/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/mandelbrot/index.js", include_str!("../../ui/plugins/mandelbrot/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/vu-meters/index.js", include_str!("../../ui/plugins/vu-meters/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/spectrum/index.js", include_str!("../../ui/plugins/spectrum/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/starfield/index.js", include_str!("../../ui/plugins/starfield/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/butterflies/index.js", include_str!("../../ui/plugins/butterflies/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/aurora/index.js", include_str!("../../ui/plugins/aurora/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/rainforest/index.js", include_str!("../../ui/plugins/rainforest/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/clouds/index.js", include_str!("../../ui/plugins/clouds/index.js"), "text/javascript; charset=utf-8"),
    ("/plugins/highland/index.js", include_str!("../../ui/plugins/highland/index.js"), "text/javascript; charset=utf-8"),
];

fn start_local_server() -> u16 {
    let file_map: HashMap<&'static str, (&'static str, &'static str)> = FILES
        .iter()
        .map(|(path, content, mime)| (*path, (*content, *mime)))
        .collect();

    let server = tiny_http::Server::http("127.0.0.1:0").expect("failed to start local server");
    let port = server.server_addr().to_ip().unwrap().port();

    thread::spawn(move || {
        for request in server.incoming_requests() {
            let path = request.url().split('?').next().unwrap_or("/");

            if let Some((content, mime)) = file_map.get(path) {
                let header_str = format!("Content-Type: {}", mime);
                let response = tiny_http::Response::from_string(*content)
                    .with_header(header_str.parse::<tiny_http::Header>().unwrap());
                let _ = request.respond(response);
            } else {
                let response = tiny_http::Response::from_string("Not Found")
                    .with_status_code(404);
                let _ = request.respond(response);
            }
        }
    });

    port
}

fn main() {
    let port = start_local_server();
    let url = format!("http://127.0.0.1:{}", port);

    tauri::Builder::default()
        .setup(move |app| {
            let webview = app.get_webview_window("main").unwrap();
            webview.navigate(url.parse::<tauri::Url>().unwrap())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
