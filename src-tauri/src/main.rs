#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::thread;
use tauri::Manager;

const HTML: &str = include_str!("../../ui/index.html");

fn start_local_server() -> u16 {
    let server = tiny_http::Server::http("127.0.0.1:0").expect("failed to start local server");
    let port = server.server_addr().to_ip().unwrap().port();

    thread::spawn(move || {
        for request in server.incoming_requests() {
            let response = tiny_http::Response::from_string(HTML)
                .with_header(
                    "Content-Type: text/html; charset=utf-8"
                        .parse::<tiny_http::Header>()
                        .unwrap(),
                );
            let _ = request.respond(response);
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
