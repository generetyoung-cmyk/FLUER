use axum::{
    extract::{ws::{Message, WebSocket}, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};
use crate::state::{AppState, WsEvent};

/// WebSocket upgrade handler — attached to GET /ws
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Client subscription message
#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "lowercase")]
enum ClientMessage {
    Subscribe { channels: Vec<String> },
    Unsubscribe { channels: Vec<String> },
    Ping,
}

/// Server message wrapper
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
enum ServerMessage {
    Connected { version: &'static str },
    Pong,
    #[serde(untagged)]
    Event(WsEvent),
    Error { message: String },
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut broadcast_rx = state.ws_broadcast.subscribe();

    // Send connected message
    let connected_msg = serde_json::to_string(&ServerMessage::Connected {
        version: env!("CARGO_PKG_VERSION"),
    })
    .unwrap_or_default();

    if sender.send(Message::Text(connected_msg.into())).await.is_err() {
        return;
    }

    // Subscribed channels for this connection (filter events)
    let mut subscribed_channels: Vec<String> = Vec::new();
    // Default: subscribe to global feed
    subscribed_channels.push("global".to_string());

    // Spawn task to forward broadcast events → client
    let mut send_task = tokio::spawn(async move {
        loop {
            match broadcast_rx.recv().await {
                Ok(event) => {
                    let json = match serde_json::to_string(&event) {
                        Ok(j) => j,
                        Err(_) => continue,
                    };
                    if sender.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    warn!("WS client lagged by {} messages — dropping", n);
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Handle incoming client messages (subscriptions, pings)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    match serde_json::from_str::<ClientMessage>(&text) {
                        Ok(ClientMessage::Subscribe { channels }) => {
                            debug!("Client subscribed to: {:?}", channels);
                            for ch in channels {
                                if !subscribed_channels.contains(&ch) {
                                    subscribed_channels.push(ch);
                                }
                            }
                        }
                        Ok(ClientMessage::Unsubscribe { channels }) => {
                            subscribed_channels.retain(|c| !channels.contains(c));
                        }
                        Ok(ClientMessage::Ping) => {
                            // Pong handled by sender task above
                        }
                        Err(_) => {}
                    }
                }
                Message::Ping(data) => {
                    // Auto-handled by axum
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Abort both tasks when either finishes
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }
}
