/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
* File Name   : signaller.js
* Created at  : 2023-10-15
* Updated at  : 2023-10-18
* Author      : jeefo
* Purpose     :
* Description :
* Reference   :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
// ignore:start

/* globals*/
/* exported*/

// ignore:end

import EventEmitter from '@jeefo/utils/event_emitter';
import VideoCallPlugin from './video_call';
import websocket from 'websocket';

const generate_transaction_id = length => {
  const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; ++i) {
    result += charSet.charAt(Math.floor(Math.random() * charSet.length));
  }
  return result;
};

export default class SignallerService extends EventEmitter {
  init(url) {
    const ws = new websocket.w3cwebsocket(url, "janus-protocol");

    ws.onopen = () => {
      if (this.debug) console.debug("WebSocket connected.");

      this.transaction_id = generate_transaction_id(12);
      this.send({
        janus       : "create",
        transaction : this.transaction_id,
      });
    };

    ws.onmessage = ({data: msg}) => {
      msg = JSON.parse(msg);
      if (msg.janus === "ack") return;
      if (this.debug) console.debug("WebSocket IN:", msg);

      switch (msg.janus) {
        case "success":
          if (!this.session_id && msg.data && msg.data.id) {
            this.plugins    = {};
            this.session_id = msg.data.id;
            this.start_keep_alive();

            this.emit("connected");
          } else {
            this.emit("success", msg);
          }
          break;
        case "event":
          if (msg.plugindata) {
            const plugin = this.plugins[msg.plugindata.plugin];
            if (plugin) {
              plugin.emit("message", msg.plugindata.data, msg.jsep);
            }
          }
          break;
        case "media":
        case "hangup":
        case "webrtcup":
          return;
        default:
          console.warn("Unhandled message:", msg);
      }
    };

    ws.onclose = () => {
      if (this.debug) console.debug("WebSocket disconnected.");
    };

    ws.onerror = err => {
      //console.error("WebSocket ERROR:", err);
    };

    this.ws = ws;
  }

  attach(plugin) {
    switch (plugin) {
      case "video_call" :
        const vc = new VideoCallPlugin(this);
        this.plugins["janus.plugin.videocall"] = vc;
        return vc;
      default:
        console.assert(false, `Plugin '${plugin}' is not implemented`);
    }
  }

  send(data) {
    this.ws?.send(JSON.stringify(data));
    if (this.debug && data.janus !== "keepalive") {
      console.debug("WebSocket OUT:", data);
    }
  }

  start_keep_alive() {
    const interval = 25000;
    const timeout = () => {
      this.send({
        janus       : "keepalive",
        session_id  : this.session_id,
        transaction : this.transaction_id,
      });

      this.timeout_id = setTimeout(timeout, interval);
    };
    this.timeout_id = setTimeout(timeout, interval);
  }

  destroy() {
    this.send({
      janus       : "destroy",
      session_id  : this.session_id,
      transaction : this.transaction_id,
    });
    this.session_id = null;
    this.ws?.close();
    this.ws = null;
  }
}